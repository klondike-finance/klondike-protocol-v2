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
import { now } from "./utils";

const INITIAL_DROID_LIQUIDITY = 0;
const INITIAL_JEDI_LIQUIDITY = 0;
const SWAP_POOL_START_DATE = Math.floor(new Date().getTime() / 1000);
const LOCK_POOL_START_DATE = Math.floor(new Date().getTime() / 1000);
const BOARDROOM_START_DATE = Math.floor(new Date().getTime() / 1000);
const TREASURY_START_DATE = Math.floor(new Date().getTime() / 1000);
const BOOST_FACTOR = 4;
const BOOST_DENOMINATOR = 500;

task("deploy", "Deploys the system").setAction(async (_, hre) => {
  await deploy(hre);
});

export async function deploy(hre: HardhatRuntimeEnvironment) {
  console.log(`Deploying on network ${hre.network.name}`);
  console.log(
    process.env.REDEPLOY
      ? "Starting fresh deploy"
      : "Continuing previous deploy"
  );

  await migrateRegistry(hre);
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
}

async function setLinks(hre: HardhatRuntimeEnvironment) {
  await setTreasuryLinks(hre, 1, 1, 1);
  const devFund = await getRegistryContract(hre, "DevFund");
  const stableFund = await getRegistryContract(hre, "StableFund");
  const boardroom = await getRegistryContract(hre, "BoardroomV1");
  const emissionsManager = await findExistingContract(hre, "EmissionManagerV1");
  await emissionsManager.setDevFund(devFund.address);
  await emissionsManager.setStableFund(stableFund.address);
  await emissionsManager.setBoardroom(boardroom.address);
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
  await contractDeploy(
    hre,
    "LockPool",
    "DroidJediLockPool",
    droid.address,
    jedi.address,
    SWAP_POOL_START_DATE
  );
  await contractDeploy(
    hre,
    "SwapPool",
    "KlonDroidSwapPool",
    klon.address,
    droid.address,
    LOCK_POOL_START_DATE,
    0
  );
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
  await contractDeploy(hre, "SyntheticToken", "Droid", "Droid", "Droid", 18);
  await contractDeploy(hre, "SyntheticToken", "Jedi", "Jedi", "Jedi", 18);
  const [op] = await hre.ethers.getSigners();
  await mint(hre, "Droid", op.address, BigNumber.from(INITIAL_DROID_LIQUIDITY));
  await mint(hre, "Jedi", op.address, BigNumber.from(INITIAL_JEDI_LIQUIDITY));
}
