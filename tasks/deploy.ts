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
import { UNISWAP_V2_FACTORY_ADDRESS } from "./uniswap";
import { isProd, now, pairFor, sendTransaction } from "./utils";

const INITIAL_DROID_LIQUIDITY = 0;
const INITIAL_JEDI_LIQUIDITY = BigNumber.from("1000000000000000000000000");
const SWAP_POOL_START_DATE = Math.floor(new Date().getTime() / 1000);
const SWAP_POOL_END_DATE = Math.floor(new Date().getTime() / 1000) + 86400 * 30;
const LOCK_POOL_START_DATE = Math.floor(new Date().getTime() / 1000);
const REWARDS_POOL_INITIAL_DURATION = 86400 * 7;
const BOARDROOM_START_DATE = Math.floor(new Date().getTime() / 1000);
const TREASURY_START_DATE = Math.floor(new Date().getTime() / 1000);
const BOOST_FACTOR = 4;
const BOOST_DENOMINATOR = 500;

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
  await deployTokensAndMint(hre);
  await deployTreasury(hre, 1, TREASURY_START_DATE);
  await deploySpecificPools(hre);
  await deployBoardroom(hre);
  await setLinks(hre);
  await transferOwnerships(hre);
}

async function transferOwnerships(hre: HardhatRuntimeEnvironment) {
  await transferFullOwnership(hre, "Droid", "KlonDroidSwapPool");
  await transferFullOwnership(hre, "Jedi", "DroidJediLockPool");
  await transferOperator(hre, "DroidJediLockPool", "MultisigWallet");
  await transferOwnership(hre, "DroidJediLockPool", "Timelock");
  await transferOperator(hre, "BoardroomV1", "MultisigWallet");
  await transferOwnership(hre, "BoardroomV1", "Timelock");
  await transferOperator(hre, "TokenManagerV1", "MultisigWallet");
  await transferOwnership(hre, "TokenManagerV1", "Timelock");
  await transferOperator(hre, "BondManagerV1", "MultisigWallet");
  await transferOwnership(hre, "BondManagerV1", "Timelock");
  await transferOperator(hre, "EmissionManagerV1", "MultisigWallet");
  await transferOwnership(hre, "EmissionManagerV1", "Timelock");
  await transferOwnership(hre, "KlonDroidSwapPool", "Timelock");
}

async function setLinks(hre: HardhatRuntimeEnvironment) {
  await setTreasuryLinks(hre, 1, 1, 1);
  const devFund = await getRegistryContract(hre, "DevFund");
  const stableFund = await getRegistryContract(hre, "StableFund");
  const boardroom = await getRegistryContract(hre, "BoardroomV1");
  const emissionsManager = await findExistingContract(hre, "EmissionManagerV1");
  const lockPool = await findExistingContract(hre, "DroidJediLockPool");
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
  const boardroomAddress = await emissionsManager.boardroom();
  if (boardroomAddress.toLowerCase() !== boardroom.address.toLowerCase()) {
    console.log(
      `EmissionManager: Boardroom is ${boardroomAddress}. Setting to ${boardroom.address}`
    );
    const tx = await emissionsManager.populateTransaction.setBoardroom(
      boardroom.address
    );
    await sendTransaction(hre, tx);
  }
  const lockPoolBoardroomAddress = await lockPool.boardroom();
  if (
    lockPoolBoardroomAddress.toLowerCase() !== boardroom.address.toLowerCase()
  ) {
    console.log(
      `LockPool: Boardroom is ${lockPoolBoardroomAddress}. Setting to ${boardroom.address}`
    );
    const tx = await lockPool.populateTransaction.setBoardroom(
      boardroom.address
    );
    await sendTransaction(hre, tx);
  }
}

async function deployBoardroom(hre: HardhatRuntimeEnvironment) {
  const droid = await findExistingContract(hre, "Droid");
  const jedi = await findExistingContract(hre, "Jedi");
  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const emissionManager = await findExistingContract(hre, "EmissionManagerV1");
  const lockPool = await findExistingContract(hre, "DroidJediLockPool");

  await contractDeploy(
    hre,
    "Boardroom",
    "BoardroomV1",
    droid.address,
    jedi.address,
    tokenManager.address,
    emissionManager.address,
    lockPool.address,
    BOOST_FACTOR,
    BOOST_DENOMINATOR,
    BOARDROOM_START_DATE
  );
}

async function deploySpecificPools(hre: HardhatRuntimeEnvironment) {
  const klon = await findExistingContract(hre, "Klon");
  const droid = await findExistingContract(hre, "Droid");
  const jedi = await findExistingContract(hre, "Jedi");
  const kwbtc = await findExistingContract(hre, "KWBTC");
  const wbtc = await findExistingContract(hre, "WBTC");
  const multiSig = await getRegistryContract(hre, "MultisigWallet");
  await contractDeploy(
    hre,
    "LockPool",
    "DroidJediLockPool",
    droid.address,
    jedi.address,
    LOCK_POOL_START_DATE
  );
  await contractDeploy(
    hre,
    "SwapPool",
    "KlonDroidSwapPool",
    klon.address,
    droid.address,
    SWAP_POOL_START_DATE,
    SWAP_POOL_END_DATE
  );
  await contractDeploy(
    hre,
    "RewardsPool",
    "DroidDAILPJediPool",
    "DroidDAILPJediPool",
    multiSig.address,
    multiSig.address,
    jedi.address,
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, droid.address, daiAddress(hre)),
    REWARDS_POOL_INITIAL_DURATION
  );
  await contractDeploy(
    hre,
    "RewardsPool",
    "JediDAILPJediPool",
    "JediDAILPJediPool",
    multiSig.address,
    multiSig.address,
    jedi.address,
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, jedi.address, daiAddress(hre)),
    REWARDS_POOL_INITIAL_DURATION
  );
  await contractDeploy(
    hre,
    "RewardsPool",
    "KWBTCWBTCLPJediPool",
    "KBTCWBTCLPJediPool",
    multiSig.address,
    multiSig.address,
    jedi.address,
    pairFor(UNISWAP_V2_FACTORY_ADDRESS, kwbtc.address, wbtc.address),
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

async function deployTokensAndMint(hre: HardhatRuntimeEnvironment) {
  const multiSig = await getRegistryContract(hre, "MultisigWallet");
  await contractDeploy(hre, "SyntheticToken", "Droid", "Droid", "Droid", 18);
  await contractDeploy(hre, "SyntheticToken", "Jedi", "Jedi", "Jedi", 18);
  const [op] = await hre.ethers.getSigners();
  await mint(
    hre,
    "Droid",
    multiSig.address,
    BigNumber.from(INITIAL_DROID_LIQUIDITY)
  );
  await mint(
    hre,
    "Jedi",
    multiSig.address,
    BigNumber.from(INITIAL_JEDI_LIQUIDITY)
  );
}
