import { BigNumber } from "@ethersproject/bignumber";
import { Contract, PopulatedTransaction } from "@ethersproject/contracts";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { findExistingContract } from "./contract";
import { getRegistryContract } from "./registry";
import { log, sendTransaction } from "./utils";

const CALL_BEFORE_REBASE_SECS = 90 * 60;

task("cron:tick")
  .addFlag("dry", "Dry run")
  .setAction(async ({ dry }, hre: HardhatRuntimeEnvironment) => {
    log(`-------------------------------------------------------------------`);
    const tokenManager = await findExistingContract(hre, "TokenManagerV1");
    const emissionManager = await findExistingContract(
      hre,
      "EmissionManagerV1"
    );
    const tokens = await tokenManager.allTokens();
    log(
      `Processing oracle updates for tokens ${tokens} at TokenManager ${tokenManager.address}`
    );
    for (const token of tokens) {
      await oracleTick(hre, token, tokenManager, emissionManager, dry);
    }

    await emissionManagerTick(hre, emissionManager, dry);
  });

async function emissionManagerTick(
  hre: HardhatRuntimeEnvironment,
  emissionManager: Contract,
  dry: boolean
) {
  log("*********");
  log(`Processing EmissionManager (${emissionManager.address}) update`);
  const start = (await emissionManager.start()).toNumber();
  const now = Math.floor(new Date().getTime() / 1000);
  if (start > now) {
    log(`Starts at ${new Date(start * 1000)} - skipping`);
    return;
  }
  const emissionManagerLastCalled = (
    await emissionManager.lastCalled()
  ).toNumber();
  const debouncePeriod = (await emissionManager.debouncePeriod()).toNumber();

  const emissionManagerNextCallDate = new Date(
    (emissionManagerLastCalled + debouncePeriod) * 1000
  );
  if (emissionManagerNextCallDate > new Date()) {
    log(
      `EmissionManager update date \`${emissionManagerNextCallDate.toISOString()}\` is in future. Skipping.`
    );
    return;
  }
  console.log(`[${new Date()}] Updating EmissionManager`);
  const tx = await emissionManager.populateTransaction.makePositiveRebase();
  if (!dry) {
    await sendTransactionWithIncreasedGas(hre, tx);
  }
  console.log(`[${new Date()}]. Done`);
}

async function oracleTick(
  hre: HardhatRuntimeEnvironment,
  token: string,
  tokenManager: Contract,
  emissionManager: Contract,
  dry: boolean
) {
  log("+++++++++++++");
  log(`Processing oracle for token ${token}`);
  const [
    synAddress,
    undAddress,
    pairAddress,
    oracleAddress,
  ] = await tokenManager.tokenIndex(token);

  const oracle = new Contract(
    oracleAddress,
    (await hre.artifacts.readArtifact("Oracle")).abi,
    hre.ethers.provider
  );

  const pair = new Contract(
    pairAddress,
    (await hre.artifacts.readArtifact("UniswapV2Pair")).abi,
    hre.ethers.provider
  );
  const start = (await oracle.start()).toNumber();
  const now = Math.floor(new Date().getTime() / 1000);
  if (start > now) {
    log(`Starts at ${new Date(start * 1000)} - skipping`);
    return;
  }

  const [reserve0, reserve1] = await pair.getReserves();
  const [synReserve, undReserve] =
    synAddress.toLowerCase() < undAddress.toLowerCase()
      ? [reserve0, reserve1]
      : [reserve1, reserve0];
  const tokenAbi = (await hre.artifacts.readArtifact("SyntheticToken")).abi;
  const synToken = new Contract(synAddress, tokenAbi, hre.ethers.provider);
  const undToken = new Contract(undAddress, tokenAbi, hre.ethers.provider);
  const synDecimals = await synToken.decimals();
  const undDecimals = await undToken.decimals();
  let adjSynReserve = synReserve;
  let adjUndReserve = undReserve;
  if (synDecimals > undDecimals) {
    adjUndReserve = adjUndReserve.mul(
      BigNumber.from(10).pow(synDecimals - undDecimals)
    );
  } else {
    adjSynReserve = adjSynReserve.mul(
      BigNumber.from(10).pow(undDecimals - synDecimals)
    );
  }
  let price = adjUndReserve.mul(10000).div(adjSynReserve);
  price = price.toNumber() / 10000;
  let oraclePrice = await oracle.consult(
    synAddress,
    BigNumber.from(10).pow(synDecimals)
  );
  oraclePrice = oraclePrice.mul(10000).div(BigNumber.from(10).pow(undDecimals));
  oraclePrice = oraclePrice.toNumber() / 10000;
  // log(` Price \`${price}\`. OraclePrice \`${oraclePrice}\``);

  const oracleLastCalled = (await oracle.lastCalled()).toNumber();
  const debouncePeriod = (await oracle.debouncePeriod()).toNumber();

  const oracleNextCallDate = new Date(
    (oracleLastCalled + debouncePeriod) * 1000
  );

  log(`Oracle can be called later than: ${oracleNextCallDate.toISOString()}`);
  if (oracleNextCallDate > new Date()) {
    log(
      `Oracle update date \`${oracleNextCallDate.toISOString()}\` is in future. Skipping.`
    );
    return;
  }

  const emissionManagerLastCalled = (
    await emissionManager.lastCalled()
  ).toNumber();
  const emDebouncePeriod = (await emissionManager.debouncePeriod()).toNumber();

  const oracleRebaseCallTime =
    emissionManagerLastCalled + emDebouncePeriod - CALL_BEFORE_REBASE_SECS;
  const updateBeforeRebase =
    oracleLastCalled < oracleRebaseCallTime &&
    new Date().getTime() / 1000 > oracleRebaseCallTime;
  log(`Should update before rebase: ${updateBeforeRebase}`);
  log(
    `Expected call time before rebase: ${new Date(
      oracleRebaseCallTime * 1000
    ).toISOString()}`
  );

  if (!updateBeforeRebase) {
    return;
  }

  // if (!updateBeforeRebase) {
  //   if (price >= 1 && oraclePrice >= 1) {
  //     log("Bonds are not available to buy -> no need to update price");
  //     return;
  //   }

  //   if (price >= oraclePrice) {
  //     log(
  //       "Bonds are priced at `price`, not `oraclePrice` -> no need to update"
  //     );
  //     return;
  //   }
  // } else {
  //   log(`Force call before rebase`);
  // }

  log(`Updating oracle`);
  const tx = await oracle.populateTransaction.update();
  if (!dry) {
    await sendTransactionWithIncreasedGas(hre, tx);
  }
  log(`Updated`);
}

async function sendTransactionWithIncreasedGas(
  hre: HardhatRuntimeEnvironment,
  tx: PopulatedTransaction
) {
  await sendTransaction(hre, tx);
}
