import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { findExistingContract } from "./contract";
import { getRegistryContract } from "./registry";
import { sendTransaction } from "./utils";

task("cron:tick").setAction(async ({}, hre: HardhatRuntimeEnvironment) => {
  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const emissionManager = await findExistingContract(hre, "EmissionManagerV1");
  const tokens = await tokenManager.allTokens();
  for (const token of tokens) {
    await oracleTick(hre, token, tokenManager);
  }
  await emissionManagerTick(hre, emissionManager);
});

async function emissionManagerTick(
  hre: HardhatRuntimeEnvironment,
  emissionManager: Contract
) {
  const emissionManagerLastCalled = (
    await emissionManager.lastCalled()
  ).toNumber();
  const debouncePeriod = (await emissionManager.debouncePeriod()).toNumber();

  const emissionManagerNextCallDate = new Date(
    (emissionManagerLastCalled + debouncePeriod) * 1000
  );
  if (emissionManagerNextCallDate > new Date()) {
    console.log(
      `[${new Date()}] EmissionManager update date \`${emissionManagerNextCallDate}\` is in future. Skipping.`
    );
    return;
  }
  console.log(`[${new Date()}] Updating EmissionManager`);
  const tx = await emissionManager.populateTransaction.makePositiveRebase();
  await sendTransaction(hre, tx);
  console.log(`[${new Date()}]. Done`);
}

async function oracleTick(
  hre: HardhatRuntimeEnvironment,
  token: string,
  tokenManager: Contract
) {
  const [
    tokenAAddress,
    tokenBAddress,
    pairAddress,
    oracleAddress,
  ] = await tokenManager.tokenIndex(token);
  const pair = new Contract(
    pairAddress,
    (await hre.artifacts.readArtifact("UniswapV2Pair")).abi,
    hre.ethers.provider
  );
  const [reserve0, reserve1] = await pair.getReserves();
  const [reserveA, reserveB] =
    tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase()
      ? [reserve0, reserve1]
      : [reserve1, reserve0];
  const tokenAbi = (await hre.artifacts.readArtifact("SyntheticToken")).abi;
  const tokenA = new Contract(tokenAAddress, tokenAbi, hre.ethers.provider);
  const tokenB = new Contract(tokenBAddress, tokenAbi, hre.ethers.provider);
  const aDecimals = await tokenA.decimals();
  const bDecimals = await tokenB.decimals();
  let adjReserveA = reserveA;
  let adjReserveB = reserveB;
  if (aDecimals > bDecimals) {
    adjReserveB = adjReserveB.mul(10 ** (aDecimals - bDecimals));
  } else {
    adjReserveA = adjReserveA.mul(10 ** (bDecimals - aDecimals));
  }
  let price = adjReserveB.mul(10000).div(adjReserveA);
  price = price.toNumber() / 10000;

  const oracle = new Contract(
    oracleAddress,
    (await hre.artifacts.readArtifact("Oracle")).abi,
    hre.ethers.provider
  );

  let oraclePrice = await oracle.consult(
    tokenAAddress,
    BigNumber.from(10).pow(aDecimals)
  );
  oraclePrice = oraclePrice.mul(10000).div(BigNumber.from(10).pow(bDecimals));
  oraclePrice = oraclePrice.toNumber() / 10000;
  console.log(
    `[${new Date()}] Token ${token}. Price \`${price}\`. OraclePrice \`${oraclePrice}\``
  );

  if (price >= 1 && oraclePrice >= 1) {
    // Bonds are not available => no need to update
    console.log(
      `[${new Date()}] Token ${token}. Price \`${price}\` and OraclePrice \`${oraclePrice}\` >= \`1.00\`. Skipping.`
    );
    return;
  }

  if (price >= oraclePrice) {
    // Bonds are priced at `price`, not `oraclePrice` => no need to update
    console.log(
      `[${new Date()}] Token ${token}. Price \`${price}\` >= OraclePrice \`${oraclePrice}\`. Skipping.`
    );
    return;
  }

  const oracleLastCalled = (await oracle.lastCalled()).toNumber();
  const debouncePeriod = (await oracle.debouncePeriod()).toNumber();

  const oracleNextCallDate = new Date(
    (oracleLastCalled + debouncePeriod) * 1000
  );
  if (oracleNextCallDate > new Date()) {
    console.log(
      `[${new Date()}] Token ${token}. Oracle update date \`${oracleNextCallDate}\` is in future. Skipping.`
    );
    return;
  }
  console.log(`[${new Date()}] Token ${token}. Updating oracle`);
  const tx = await oracle.populateTransaction.update();
  await sendTransaction(hre, tx);
  console.log(`[${new Date()}] Token ${token}. Done`);
}
