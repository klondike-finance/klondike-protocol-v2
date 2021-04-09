import { BigNumber, ethers } from "ethers";
import { readFileSync } from "fs";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy, findExistingContract } from "./contract";
import {
  getRegistryContract,
  updateRegistry,
  writeIfMissing,
} from "./registry";
import {
  mint,
  transferFullOwnership,
  transferOperator,
  transferOwnership,
} from "./token";
import { deployTreasury, setTreasuryLinks } from "./treasury";
import {
  addLiquidity,
  UNISWAP_V2_FACTORY_ADDRESS,
  UNISWAP_V2_ROUTER_ADDRESS,
} from "./uniswap";
import { tokenDeploy } from "./token";
import { ETH, BTC, isProd, now, pairFor, sendTransaction } from "./utils";

const DAY_TICK = 60; // for mainnet deploy set to 86400
const T = Math.floor(new Date().getTime() / 1000);
const VE_TOKEN_START = T;
const SWAP_POOL_START_DATE = T + DAY_TICK;
const SWAP_POOL_END_DATE = T + DAY_TICK * 8;
const ORACLE_START_DATE = T;
const REWARDS_POOL_INITIAL_DURATION = 86400 * 7;
const BOARDROOM_START_DATE = T + DAY_TICK * 3;
const TREASURY_START_DATE = BOARDROOM_START_DATE;
const ORACLE_PERIOD = Math.round(DAY_TICK / 24);
const EMISSION_MANAGER_PERIOD = DAY_TICK;
const TIMELOCK_PERIOD = DAY_TICK * 2;
const LP_KLONX_WBTC_WBTC_AMOUNT = BigNumber.from(213000);
const LP_KLONX_WBTC_KLONX_AMOUNT = ETH;
const LP_KXUSD_DAI_KXUSD_AMOUNT = BigNumber.from(100).mul(ETH);
const LP_KXUSD_DAI_DAI_AMOUNT = BigNumber.from(100).mul(ETH);
const LP_KWBTC_WBTC_KWBTC_AMOUNT = BigNumber.from(1).mul(ETH).div(1000);
const LP_KWBTC_WBTC_WBTC_AMOUNT = BigNumber.from(1).mul(BTC).div(1000);
const EXTERNAL_TESTERS = [
  "0x2ceffca5c29c3e1d9a2586e49d80c7a057d8c5f9",
  "0xCEbc1DEcABb266e064FB9759fd413A885dA885dd",
];
const MULTISIG_ADDRESSES_PROD = [
  "0xc9703331D70faEea6516FB793b9f49d3CcD1037C",
  "0x7217084Dd74CD28c9cFd4C7e612cdc631c4A5030",
  "0x6c907824d4c5b34920602EbA103649c435AAD449",
];
const MULTISIG_ADDRESSES_TEST = [
  "0x6323a5ddCcc4f7A736477756e80947B823291528",
  "0xCEbc1DEcABb266e064FB9759fd413A885dA885dd",
  "0x2CEFFCA5C29c3E1d9a2586E49D80c7A057d8c5F9",
];

const INITIAL_KXUSD_LIQUIDITY = LP_KXUSD_DAI_KXUSD_AMOUNT.add(
  BigNumber.from(50000).mul(ETH)
);
const INITIAL_KWBTC_LIQUIDITY = LP_KWBTC_WBTC_KWBTC_AMOUNT.add(
  BigNumber.from(1).mul(ETH)
);

task("deploy", "Deploys the system").setAction(async (_, hre) => {
  await deploy(hre);
});

function trader(hre: HardhatRuntimeEnvironment) {
  return isProd(hre)
    ? "0x1be8DAA03cc29E39d6E6710a1570CDaf3f413Ef2"
    : "0xac602665f618652d53565519eaf24d0326c2ec1a";
}

export async function deploy(hre: HardhatRuntimeEnvironment) {
  console.log(`Deploying on network ${hre.network.name}`);
  console.log(
    process.env.REDEPLOY
      ? "Starting fresh deploy"
      : "Continuing previous deploy"
  );

  await importExternalIntoRegistry(hre);
  await deploySyntheticTokens(hre);
  await deployKlonX(hre);
  await deployVeKlonX(hre);
  await deployFunds(hre);
  await deployTreasury(hre, 1, TREASURY_START_DATE, EMISSION_MANAGER_PERIOD);
  await deploySpecificPools(hre);
  await deployBoardrooms(hre);
  await deployTimelockAndMultisig(hre);
  await setLinks(hre);
  await addTokensToTokenManagerAndVeBoardroom(hre);
  await transferOwnerships(hre);
}

async function deployTimelockAndMultisig(hre: HardhatRuntimeEnvironment) {
  const addresses = isProd(hre)
    ? MULTISIG_ADDRESSES_PROD
    : MULTISIG_ADDRESSES_TEST;
  const requirement = isProd(hre)
    ? Math.floor(MULTISIG_ADDRESSES_PROD.length / 2) + 1
    : 1;
  const multisig = await contractDeploy(
    hre,
    "MultiSigWallet",
    "MultiSigWallet",
    addresses,
    requirement
  );
  await contractDeploy(
    hre,
    "Timelock",
    "Timelock",
    multisig.address,
    TIMELOCK_PERIOD
  );
}

async function deploySyntheticTokens(hre: HardhatRuntimeEnvironment) {
  const initialExternalLiquidity = ETH.mul(1000000);
  const [op] = await hre.ethers.getSigners();
  const kwbtc = await tokenDeploy(hre, "KWBTC", "KWBTC");
  const kbwbtc = await tokenDeploy(hre, "KB-WBTC", "KB-WBTC");
  const wbtc = await tokenDeploy(hre, "WBTC", "WBTC", 8);
  const kxusd = await tokenDeploy(hre, "KXUSD", "KXUSD");
  const kbusd = await tokenDeploy(hre, "KB-USD", "KB-USD");
  const dai = await tokenDeploy(hre, "DAI", "DAI");
  if (!isProd(hre)) {
    for (const address of [op.address, ...EXTERNAL_TESTERS]) {
      await mint(
        hre,
        "WBTC",
        address,
        initialExternalLiquidity.div(BigNumber.from(10).pow(10))
      );
      await mint(hre, "DAI", address, initialExternalLiquidity);
      await mint(hre, "KWBTC", address, initialExternalLiquidity);
      await mint(hre, "KXUSD", address, initialExternalLiquidity);
    }
  } else {
    await mint(hre, "KWBTC", op.address, INITIAL_KWBTC_LIQUIDITY);
    await mint(hre, "KXUSD", op.address, INITIAL_KXUSD_LIQUIDITY);
  }
  const wbtcBalance = await wbtc.balanceOf(op.address);
  if (wbtcBalance < LP_KWBTC_WBTC_WBTC_AMOUNT) {
    throw new Error(
      `LP-KWBTC-WBTC: Current WBTC balance \`${wbtcBalance}\` < required Uniswap balance \`${LP_KLONX_WBTC_WBTC_AMOUNT}\``
    );
  }
  await addLiquidity(
    hre,
    "KWBTC",
    "WBTC",
    BigNumber.from(LP_KWBTC_WBTC_KWBTC_AMOUNT),
    BigNumber.from(LP_KWBTC_WBTC_WBTC_AMOUNT)
  );

  const daiBalance = await dai.balanceOf(op.address);
  if (daiBalance < LP_KXUSD_DAI_DAI_AMOUNT) {
    throw new Error(
      `LP-KXUSD-DAI: Current DAI balance \`${daiBalance}\` < required Uniswap balance \`${LP_KXUSD_DAI_DAI_AMOUNT}\``
    );
  }
  await addLiquidity(
    hre,
    "KXUSD",
    "DAI",
    BigNumber.from(LP_KXUSD_DAI_KXUSD_AMOUNT),
    BigNumber.from(LP_KXUSD_DAI_DAI_AMOUNT)
  );

  await contractDeploy(
    hre,
    "Oracle",
    "KWBTCWBTCOracle",
    UNISWAP_V2_FACTORY_ADDRESS,
    kwbtc.address,
    wbtc.address,
    ORACLE_PERIOD,
    ORACLE_START_DATE
  );
  await contractDeploy(
    hre,
    "Oracle",
    "KXUSDDAIOracle",
    UNISWAP_V2_FACTORY_ADDRESS,
    kxusd.address,
    dai.address,
    ORACLE_PERIOD,
    ORACLE_START_DATE
  );
}

async function deployFunds(hre: HardhatRuntimeEnvironment) {
  const kwbtc = await findExistingContract(hre, "KWBTC");
  const dai = await findExistingContract(hre, "DAI");
  await contractDeploy(
    hre,
    "StabFund",
    "StabFundV1",
    UNISWAP_V2_ROUTER_ADDRESS,
    [kwbtc.address, dai.address],
    [trader(hre)]
  );
  await contractDeploy(hre, "DevFund", "DevFundV1");
}

async function transferPoolOwnership(
  hre: HardhatRuntimeEnvironment,
  ownerName: string,
  targetName: string
) {
  const owner = await findExistingContract(hre, ownerName);
  const target = await getRegistryContract(hre, targetName);

  console.log(`Transferring owner of ${ownerName} to ${target.address}`);
  const ow = await owner.owner();
  if (ow.toLowerCase() === target.address.toLowerCase()) {
    console.log(
      `${target.address} is already an owner of ${ownerName}. Skipping...`
    );
    return;
  }
  const nomow = await owner.nominatedOwner();
  if (nomow.toLowerCase() === target.address.toLowerCase()) {
    console.log(
      `${target.address} is already nominated in ${ownerName}. Skipping...`
    );
    return;
  }

  const [signer] = await hre.ethers.getSigners();
  const contractOwner = await owner.owner();
  if (contractOwner.toLowerCase() != signer.address.toLowerCase()) {
    console.log(
      `Tx sender \`${signer.address}\` is not the owner of \`${owner.address}\`. The owner is \`${contractOwner}\`. Skipping...`
    );
    return;
  }

  console.log("Nominating new owner");
  const tx = await owner.populateTransaction.nominateNewOwner(target.address);
  await sendTransaction(hre, tx);
}

async function transferOwnerships(hre: HardhatRuntimeEnvironment) {
  await transferFullOwnership(hre, "KlonX", "KlonKlonXSwapPool");

  await transferPoolOwnership(hre, "KlonXWBTCLPKlonXPool", "MultisigWallet");
  await transferPoolOwnership(hre, "KWBTCWBTCLPKlonXPool", "MultisigWallet");
  await transferPoolOwnership(hre, "KXUSDDAILPKlonXPool", "MultisigWallet");
  await transferOperator(hre, "LiquidBoardroomV1", "MultisigWallet");
  await transferOwnership(hre, "LiquidBoardroomV1", "Timelock");
  await transferOperator(hre, "UniswapBoardroomV1", "MultisigWallet");
  await transferOwnership(hre, "UniswapBoardroomV1", "Timelock");
  await transferOperator(hre, "TokenManagerV1", "MultisigWallet");
  await transferOwnership(hre, "TokenManagerV1", "Timelock");
  await transferOperator(hre, "BondManagerV1", "MultisigWallet");
  await transferOwnership(hre, "BondManagerV1", "Timelock");
  await transferOperator(hre, "EmissionManagerV1", "MultisigWallet");
  await transferOwnership(hre, "EmissionManagerV1", "Timelock");
  await transferOperator(hre, "StabFundV1", "MultisigWallet");
  await transferOwnership(hre, "StabFundV1", "Timelock");
  await transferOwnership(hre, "KlonKlonXSwapPool", "Timelock");

  const veKlonX = await findExistingContract(hre, "VeKlonX");
  const timelock = await getRegistryContract(hre, "Timelock");
  const veKlonXOwner = await veKlonX.admin();
  if (veKlonXOwner.toLowerCase() != timelock.address.toLowerCase()) {
    console.log(`Setting VeKlonX admin to ${timelock.address}`);

    let tx = await veKlonX.populateTransaction.commit_transfer_ownership(
      timelock.address
    );
    await sendTransaction(hre, tx);
    tx = await veKlonX.populateTransaction.apply_transfer_ownership();
    await sendTransaction(hre, tx);
  }
  const veKlonXController = await veKlonX.controller();
  if (veKlonXController.toLowerCase() != timelock.address.toLowerCase()) {
    console.log(`Setting VeKlonX controller to ${timelock.address}`);
    let tx = await veKlonX.populateTransaction.changeController(
      timelock.address
    );
    await sendTransaction(hre, tx);
  }

  const veBoardroom = await findExistingContract(hre, "VeBoardroomV1");
  const veBoardroomOwner = await veBoardroom.admin();
  if (veBoardroomOwner.toLowerCase() != timelock.address.toLowerCase()) {
    let tx = await veBoardroom.populateTransaction.commit_admin(
      timelock.address
    );
    await sendTransaction(hre, tx);
    tx = await veBoardroom.populateTransaction.apply_admin();
    await sendTransaction(hre, tx);
  }
}

async function addTokensToTokenManagerAndVeBoardroom(
  hre: HardhatRuntimeEnvironment
) {
  console.log(`Adding tokens to TokenManager`);
  const kwbtc = await findExistingContract(hre, "KWBTC");
  const kbwbtc = await findExistingContract(hre, "KB-WBTC");
  const wbtc = await findExistingContract(hre, "WBTC");
  const kxusd = await findExistingContract(hre, "KXUSD");
  const kbusd = await findExistingContract(hre, "KB-USD");
  const dai = await findExistingContract(hre, "DAI");

  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const veBoardroom = await findExistingContract(hre, "VeBoardroomV1");
  const kwtbcOracle = await findExistingContract(hre, "KWBTCWBTCOracle");
  const kxusdOracle = await findExistingContract(hre, "KXUSDDAIOracle");

  const veTokensLen = await veBoardroom.tokens_len();
  const promises = [];
  for (let i = 0; i < veTokensLen; i++) {
    promises.push(veBoardroom.tokens(i));
  }
  const veTokens = (await Promise.all(promises)).map((x) => x.toLowerCase());

  for (const { syn, und, bond, oracle } of [
    { syn: kwbtc, und: wbtc, bond: kbwbtc, oracle: kwtbcOracle },
    { syn: kxusd, und: dai, bond: kbusd, oracle: kxusdOracle },
  ]) {
    if (await tokenManager.isManagedToken(syn.address)) {
      console.log(`${syn.address} is already managed. Skipping...`);
    } else {
      console.log(`Adding ${syn.address} token to TokenManager...`);
      const tx = await tokenManager.populateTransaction.addToken(
        syn.address,
        bond.address,
        und.address,
        oracle.address
      );
      await sendTransaction(hre, tx);
    }

    const isManagedByVeBoadroom = veTokens.includes(syn.address.toLowerCase());
    if (isManagedByVeBoadroom) {
      console.log(
        `${syn.address} is already managed by VeBoardroom. Skipping...`
      );
    } else {
      console.log(`Adding ${syn.address} to VeBoardroom`);
      const tx = await veBoardroom.populateTransaction.add_token(
        kwbtc.address,
        VE_TOKEN_START
      );
      await sendTransaction(hre, tx);
    }
  }
}

async function setLinks(hre: HardhatRuntimeEnvironment) {
  console.log("Setting links");
  const [op] = await hre.ethers.getSigners();
  await setTreasuryLinks(hre, 1, 1, 1);
  const devFund = await getRegistryContract(hre, "DevFundV1");
  const stabFund = await getRegistryContract(hre, "StabFundV1");
  const liquidBoardroom = await findExistingContract(hre, "LiquidBoardroomV1");
  const uniswapBoardroom = await findExistingContract(
    hre,
    "UniswapBoardroomV1"
  );
  const emissionsManager = await findExistingContract(hre, "EmissionManagerV1");
  const lpPool = await findExistingContract(hre, "KlonXWBTCLPKlonXPool");
  const veKlonX = await findExistingContract(hre, "VeKlonX");
  const emissionManagerOwner = await emissionsManager.owner();
  if (emissionManagerOwner.toLowerCase() === op.address.toLowerCase()) {
    console.log("Checking devFund @ emissionManager");
    const devFundAddress = await emissionsManager.devFund();
    if (devFundAddress.toLowerCase() !== devFund.address.toLowerCase()) {
      console.log(
        `EmissionManager: DevFund is ${devFundAddress}. Setting to ${devFund.address}`
      );
      const tx = await emissionsManager.populateTransaction.setDevFund(
        devFund.address
      );
      await sendTransaction(hre, tx);
    }
    console.log("Checking stabFund @ emissionsManager");
    const stabFundAddress = await emissionsManager.stableFund();
    if (stabFundAddress.toLowerCase() !== stabFund.address.toLowerCase()) {
      console.log(
        `EmissionManager: StabFund is ${stabFundAddress}. Setting to ${stabFund.address}`
      );
      const tx = await emissionsManager.populateTransaction.setStableFund(
        stabFund.address
      );
      await sendTransaction(hre, tx);
    }
    console.log("Checking liquidBoardroom @ emissionManager");
    const liquidBoardroomAddress = await emissionsManager.liquidBoardroom();
    if (
      liquidBoardroomAddress.toLowerCase() !==
      liquidBoardroom.address.toLowerCase()
    ) {
      console.log(
        `EmissionManager: LiquidBoardroom is ${liquidBoardroomAddress}. Setting to ${liquidBoardroom.address}`
      );
      const tx = await emissionsManager.populateTransaction.setLiquidBoardroom(
        liquidBoardroom.address
      );
      await sendTransaction(hre, tx);
    }

    console.log("Checking uniswapBoardroom @ emissionManager");
    const uniswapBoardroomAddress = await emissionsManager.uniswapBoardroom();
    if (
      uniswapBoardroomAddress.toLowerCase() !==
      uniswapBoardroom.address.toLowerCase()
    ) {
      console.log(
        `EmissionManager: UniswapBoardroom is ${uniswapBoardroomAddress}. Setting to ${uniswapBoardroom.address}`
      );
      const tx = await emissionsManager.populateTransaction.setUniswapBoardroom(
        uniswapBoardroom.address
      );
      await sendTransaction(hre, tx);
    }
  } else {
    console.log(
      `EmissionManager owner is ${emissionManagerOwner}, current operator is ${op.address}. Cannot set boardroom links - skipping`
    );
  }

  const lpPoolOwner = await lpPool.owner();
  if (lpPoolOwner.toLowerCase() !== op.address) {
    console.log("KlonXWBTCLPKlonXPool ownership transferred. Skipping...");
  } else {
    console.log("Checking boardroom @ KlonXWBTCLPKlonXPool");

    const lpPoolBoardroomAddress = await lpPool.boardroom();
    if (
      lpPoolBoardroomAddress.toLowerCase() !=
      uniswapBoardroom.address.toLowerCase()
    ) {
      console.log(
        `KlonXWBTCLPKlonXPool: Boardroom is ${lpPoolBoardroomAddress}. Setting to ${uniswapBoardroom.address}`
      );

      const tx = await lpPool.populateTransaction.setBoardroom(
        uniswapBoardroom.address
      );
      await sendTransaction(hre, tx);
    }
  }

  const liquidBoardroomOwner = await liquidBoardroom.owner();
  if (liquidBoardroomOwner.toLowerCase() !== op.address) {
    console.log("LiquidBoardroom ownership transferred. Skipping...");
  } else {
    console.log("Checking veToken @ LiquidBoardroom");
    const veKlonXAddress = await liquidBoardroom.veToken();
    if (veKlonXAddress.toLowerCase() != veKlonX.address.toLowerCase()) {
      console.log(
        `LiquidBoardroom: VeToken is ${veKlonXAddress}. Setting to ${veKlonX.address}`
      );

      const tx = await liquidBoardroom.populateTransaction.setVeToken(
        veKlonX.address
      );
      await sendTransaction(hre, tx);
    }
  }

  const uniswapBoardroomOwner = await uniswapBoardroom.owner();
  if (uniswapBoardroomOwner.toLowerCase() !== op.address) {
    console.log("UniswapBoardroom ownership transferred. Skipping...");
  } else {
    console.log("Checking lpPool @ UniswapBoardroom");
    const lpPoolAddress = await uniswapBoardroom.lpPool();
    if (lpPoolAddress.toLowerCase() != lpPool.address.toLowerCase()) {
      console.log(
        `UniswapBoardroom: LpPool is ${lpPoolAddress}. Setting to ${lpPool.address}`
      );
      const tx = await uniswapBoardroom.populateTransaction.setLpPool(
        lpPool.address
      );
      await sendTransaction(hre, tx);
    }
  }
}

async function deployBoardrooms(hre: HardhatRuntimeEnvironment) {
  const [op] = await hre.ethers.getSigners();
  const klonx = await findExistingContract(hre, "KlonX");
  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const emissionManager = await findExistingContract(hre, "EmissionManagerV1");
  const wbtc = await findExistingContract(hre, "WBTC");
  const veklonx = await findExistingContract(hre, "VeKlonX");
  const timelock = await getRegistryContract(hre, "Timelock");

  await contractDeploy(
    hre,
    "LiquidBoardroom",
    "LiquidBoardroomV1",
    klonx.address,
    tokenManager.address,
    emissionManager.address,
    BOARDROOM_START_DATE
  );
  await contractDeploy(
    hre,
    "UniswapBoardroom",
    "UniswapBoardroomV1",
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, klonx.address, wbtc.address),
    tokenManager.address,
    emissionManager.address,
    BOARDROOM_START_DATE
  );
  await contractDeploy(
    hre,
    "VeBoardroom",
    "VeBoardroomV1",
    veklonx.address,
    op.address,
    timelock.address
  );
}

async function deploySpecificPools(hre: HardhatRuntimeEnvironment) {
  const klonx = await findExistingContract(hre, "KlonX");
  const kwbtc = await findExistingContract(hre, "KWBTC");
  const kxusd = await findExistingContract(hre, "KXUSD");
  const dai = await findExistingContract(hre, "DAI");
  const wbtc = await findExistingContract(hre, "WBTC");
  const multisig = await getRegistryContract(hre, "MultisigWallet");
  const [op] = await hre.ethers.getSigners();
  await contractDeploy(
    hre,
    "RewardsPool",
    "KlonXWBTCLPKlonXPool",
    "KlonXWBTCLPKlonXPool",
    op.address,
    multisig.address,
    klonx.address,
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, klonx.address, wbtc.address),
    REWARDS_POOL_INITIAL_DURATION
  );
  await contractDeploy(
    hre,
    "RewardsPool",
    "KWBTCWBTCLPKlonXPool",
    "KWBTCWBTCLPKlonXPool",
    op.address,
    multisig.address,
    klonx.address,
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, kwbtc.address, wbtc.address),
    REWARDS_POOL_INITIAL_DURATION
  );
  await contractDeploy(
    hre,
    "RewardsPool",
    "KXUSDDAILPKlonXPool",
    "KXUSDDAILPKlonXPool",
    op.address,
    multisig.address,
    klonx.address,
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, kxusd.address, dai.address),
    REWARDS_POOL_INITIAL_DURATION
  );
}

async function importExternalIntoRegistry(hre: HardhatRuntimeEnvironment) {
  if (!isProd(hre)) {
    return;
  }
  writeIfMissing(hre, "DAI", {
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    registryName: "DAI",
    name: "SyntheticToken",
    args: ["DAI", "DAI", 18],
  });
  writeIfMissing(hre, "WBTC", {
    address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    registryName: "WBTC",
    name: "SyntheticToken",
    args: ["WBTC", "WBTC", 8],
  });
}

async function migrateRegistry(hre: HardhatRuntimeEnvironment) {
  const data = readFileSync(
    `${__dirname}/../tmp/deployed.v1.${hre.network.name}.json`
  );
  const v1Registry = JSON.parse(data.toString());
  if (!v1Registry[hre.network.name]) {
    throw `Network \`${hre.network.name}\` not found in \`tmp/deployed.v1.${hre.network.name}.json\``;
  }
  for (const tuple of [
    ["WBTC", "SyntheticToken", "WBTC"],
    ["KBTC", "SyntheticToken", "KWBTC"],
    ["Kbond", "SyntheticToken", "KB-WBTC"],
    ["Klon", "SyntheticToken", "Klon"],
    ["WBTC", "SyntheticToken", "WBTC"],
    ["DevFund", null, "DevFund"],
    ["MultiSigWallet", null, "MultisigWallet"],
    ["Timelock", null, "Timelock"],
  ]) {
    const [oldName, contractName, registryName] = tuple;
    const entry = {
      ...v1Registry[hre.network.name][oldName || ""],
      name: contractName,
      registryName,
    };
    delete entry["frozen"];
    writeIfMissing(hre, registryName || "", entry);
  }
}

async function deployKlonX(hre: HardhatRuntimeEnvironment) {
  const [op] = await hre.ethers.getSigners();
  const wbtc = await findExistingContract(hre, "WBTC");
  const wbtcBalance = await wbtc.balanceOf(op.address);
  if (wbtcBalance < LP_KLONX_WBTC_WBTC_AMOUNT) {
    throw new Error(
      `Current WBTC balance \`${wbtcBalance}\` < required Uniswap balance \`${LP_KLONX_WBTC_WBTC_AMOUNT}\``
    );
  }
  await tokenDeploy(hre, "KlonX", "KlonX");
  if (!isProd(hre)) {
    for (const address of [op.address, ...EXTERNAL_TESTERS]) {
      await mint(hre, "KlonX", address, ETH.mul(1000000000));
    }
  }
  await mint(hre, "KlonX", op.address, ETH);
  await addLiquidity(
    hre,
    "KlonX",
    "WBTC",
    LP_KLONX_WBTC_KLONX_AMOUNT,
    LP_KLONX_WBTC_WBTC_AMOUNT
  );
}

async function deployVeKlonX(hre: HardhatRuntimeEnvironment) {
  const klonx = await findExistingContract(hre, "KlonX");
  await contractDeploy(
    hre,
    "VeToken",
    "VeKlonX",
    klonx.address,
    "VeKlonX",
    "VeKlonX",
    "1"
  );
}
