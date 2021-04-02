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
import { addLiquidity, UNISWAP_V2_FACTORY_ADDRESS } from "./uniswap";
import { tokenDeploy } from "./token";
import { ETH, isProd, now, pairFor, sendTransaction } from "./utils";

const DAY_TICK = 60; // for prod deploy set to 86400
const T = Math.floor(new Date().getTime() / 1000);
const VE_TOKEN_START = T;
const SWAP_POOL_START_DATE = T + DAY_TICK;
const SWAP_POOL_END_DATE = T + DAY_TICK * 8;
const ORACLE_START_DATE = T;
const REWARDS_POOL_INITIAL_DURATION = DAY_TICK * 7;
const BOARDROOM_START_DATE = T + DAY_TICK * 3;
const TREASURY_START_DATE = BOARDROOM_START_DATE;
const ORACLE_PERIOD = Math.round(DAY_TICK / 24);
const UNISWAP_WBTC_AMOUNT = BigNumber.from(213000);
const UNISWAP_KLONX_AMOUNT = ETH;
const UNISWAP_KXUSD_AMOUNT = BigNumber.from(100).mul(ETH);

task("deploy", "Deploys the system").setAction(async (_, hre) => {
  await deploy(hre);
});

function daiAddress(hre: HardhatRuntimeEnvironment) {
  return isProd(hre)
    ? "0x6b175474e89094c44da98b954eedeac495271d0f"
    : "0xad80dc70c563d76be3940d73d42c0d70d4652f41";
}

export async function deploy(hre: HardhatRuntimeEnvironment) {
  console.log(`Deploying on network ${hre.network.name}`);
  console.log(
    process.env.REDEPLOY
      ? "Starting fresh deploy"
      : "Continuing previous deploy"
  );

  await migrateRegistry(hre);
  await importExternalIntoRegistry(hre);
  await deployKlonX(hre);
  await deployVeKlonX(hre);
  await deployTreasury(hre, 1, TREASURY_START_DATE);
  await deploySpecificPools(hre);
  await deployBoardrooms(hre);
  await setLinks(hre);
  await addKWBTCToken(hre);
  await addKXUSDToken(hre);
  await transferOwnerships(hre);
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
  await transferOwnership(hre, "KlonKlonXSwapPool", "Timelock");

  const veKlonX = await findExistingContract(hre, "VeKlonX");
  const timelock = await getRegistryContract(hre, "Timelock");
  const veKlonXOwner = await veKlonX.admin();
  if (veKlonXOwner.toLowerCase() != timelock.address.toLowerCase()) {
    let tx = await veKlonX.populateTransaction.commit_transfer_ownership(
      timelock.address
    );
    await sendTransaction(hre, tx);
    tx = await veKlonX.populateTransaction.apply_transfer_ownership();
    await sendTransaction(hre, tx);
  }
}

async function addKWBTCToken(hre: HardhatRuntimeEnvironment) {
  console.log("Adding KWBTC token...");
  const kwbtc = await findExistingContract(hre, "KWBTC");
  const kbwbtc = await findExistingContract(hre, "KB-WBTC");
  const wbtc = await findExistingContract(hre, "WBTC");
  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const veBoardroom = await findExistingContract(hre, "VeBoardroomV1");
  const oracle = await contractDeploy(
    hre,
    "Oracle",
    "KWBTCWBTCOracle",
    UNISWAP_V2_FACTORY_ADDRESS,
    kwbtc.address,
    wbtc.address,
    ORACLE_PERIOD,
    ORACLE_START_DATE
  );
  const isManagedToken = await tokenManager.isManagedToken(kwbtc.address);
  if (isManagedToken) {
    console.log(`KWBTC is already managed by TokenManager. Skipping...`);
  } else {
    console.log(`Adding KBTC token to TokenManager...`);
    const tx = await tokenManager.populateTransaction.addToken(
      kwbtc.address,
      kbwbtc.address,
      wbtc.address,
      oracle.address
    );
    await sendTransaction(hre, tx);
  }
  const veTokensLen = await veBoardroom.tokens_len();
  const promises = [];
  for (let i = 0; i < veTokensLen; i++) {
    promises.push(veBoardroom.tokens(i));
  }
  const veTokens = (await Promise.all(promises)).map((x) => x.toLowerCase());

  const isManagedByVeBoadroom = veTokens.includes(kwbtc.address.toLowerCase());
  if (isManagedByVeBoadroom) {
    console.log(`KWBTC is already managed by VeBoardroom. Skipping...`);
    return;
  }
  console.log("Adding KWBTC to VeBoardroom");
  const tx = await veBoardroom.populateTransaction.add_token(
    kwbtc.address,
    VE_TOKEN_START
  );
  await sendTransaction(hre, tx);
}

async function addKXUSDToken(hre: HardhatRuntimeEnvironment) {
  console.log("Adding KXUSD token...");
  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const veBoardroom = await findExistingContract(hre, "VeBoardroomV1");
  const [op] = await hre.ethers.getSigners();
  const kxusd = await tokenDeploy(hre, "KXUSD", "KXUSD");
  await mint(hre, "KXUSD", op.address, BigNumber.from(UNISWAP_KXUSD_AMOUNT));
  const kbusd = await tokenDeploy(hre, "KB-USD", "KB-USD");
  await addLiquidity(
    hre,
    "KXUSD",
    "DAI",
    BigNumber.from(UNISWAP_KXUSD_AMOUNT),
    BigNumber.from(UNISWAP_KXUSD_AMOUNT)
  );
  const oracle = await contractDeploy(
    hre,
    "Oracle",
    "KXUSDDAIOracle",
    UNISWAP_V2_FACTORY_ADDRESS,
    kxusd.address,
    daiAddress(hre),
    ORACLE_PERIOD,
    ORACLE_START_DATE
  );
  const isManagedToken = await tokenManager.isManagedToken(kxusd.address);
  if (isManagedToken) {
    console.log(`KXUSD is already managed. Skipping...`);
    return;
  }
  console.log(`Adding KXUSD token to TokenManager...`);
  const tokenManagerOperator = await tokenManager.operator();
  if (tokenManagerOperator.toLowerCase() !== op.address.toLowerCase()) {
    console.log(
      `TokenManager ownership is set to ${tokenManagerOperator}. Current operator is ${op.address}. Skipping...`
    );
  } else {
    const tx = await tokenManager.populateTransaction.addToken(
      kxusd.address,
      kbusd.address,
      daiAddress(hre),
      oracle.address
    );
    await sendTransaction(hre, tx);
  }
  const veTokensLen = await veBoardroom.tokens_len();
  const promises = [];
  for (let i = 0; i < veTokensLen; i++) {
    promises.push(veBoardroom.tokens(i));
  }
  const veTokens = (await Promise.all(promises)).map((x) => x.toLowerCase());
  const isManagedByVeBoadroom = veTokens.includes(kxusd.address.toLowerCase());
  if (isManagedByVeBoadroom) {
    console.log(`KXUSD is already managed by VeBoardroom. Skipping...`);
    return;
  }
  console.log("Adding KXUSD to VeBoardroom");
  const tx = await veBoardroom.populateTransaction.add_token(
    kxusd.address,
    VE_TOKEN_START
  );
  await sendTransaction(hre, tx);
}

async function setLinks(hre: HardhatRuntimeEnvironment) {
  console.log("Setting links");
  await setTreasuryLinks(hre, 1, 1, 1);
  const devFund = await getRegistryContract(hre, "DevFund");
  const stableFund = await getRegistryContract(hre, "StableFund");
  const liquidBoardroom = await findExistingContract(hre, "LiquidBoardroomV1");
  const uniswapBoardroom = await findExistingContract(
    hre,
    "UniswapBoardroomV1"
  );
  const emissionsManager = await findExistingContract(hre, "EmissionManagerV1");
  const lpPool = await findExistingContract(hre, "KlonXWBTCLPKlonXPool");
  const veKlonX = await findExistingContract(hre, "VeKlonX");
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
  console.log("Checking stableFund @ emissionsManager");
  const stableFundAddress = await emissionsManager.stableFund();
  if (stableFundAddress.toLowerCase() !== stableFund.address.toLowerCase()) {
    console.log(
      `EmissionManager: StableFund is ${stableFundAddress}. Setting to ${stableFund.address}`
    );
    const tx = await emissionsManager.populateTransaction.setStableFund(
      stableFund.address
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
  const klon = await findExistingContract(hre, "Klon");
  const klonx = await findExistingContract(hre, "KlonX");
  const kwbtc = await findExistingContract(hre, "KWBTC");
  const kxusd = await findExistingContract(hre, "KXUSD");
  const wbtc = await findExistingContract(hre, "WBTC");
  const multisig = await getRegistryContract(hre, "MultisigWallet");
  const [op] = await hre.ethers.getSigners();
  await contractDeploy(
    hre,
    "SwapPool",
    "KlonKlonXSwapPool",
    klon.address,
    klonx.address,
    SWAP_POOL_START_DATE,
    SWAP_POOL_END_DATE
  );
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
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, kxusd.address, daiAddress(hre)),
    REWARDS_POOL_INITIAL_DURATION
  );
}

async function importExternalIntoRegistry(hre: HardhatRuntimeEnvironment) {
  const entry = {
    address: daiAddress(hre),
    registryName: "DAI",
    name: "SyntheticToken",
    args: ["DAI", "DAI", 18],
  };
  writeIfMissing(hre, "DAI", entry);
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
    ["StableFund", null, "StableFund"],
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
  if (wbtcBalance < UNISWAP_WBTC_AMOUNT) {
    throw new Error(
      `Current WBTC balance \`${wbtcBalance}\` < required Uniswap balance \`${UNISWAP_WBTC_AMOUNT}\``
    );
  }
  const klonx = await contractDeploy(
    hre,
    "SyntheticToken",
    "KlonX",
    "KlonX",
    "KlonX",
    18
  );
  await mint(hre, "KlonX", op.address, ETH);
  await addLiquidity(
    hre,
    "KlonX",
    "WBTC",
    UNISWAP_KLONX_AMOUNT,
    UNISWAP_WBTC_AMOUNT
  );
}

async function deployVeKlonX(hre: HardhatRuntimeEnvironment) {
  const klonx = await findExistingContract(hre, "WBTC");
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
