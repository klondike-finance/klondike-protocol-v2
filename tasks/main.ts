import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy, findExistingContract } from "./contract";
import { BTC, ETH, isProd, now, sendTransaction } from "./utils";
import { getRegistryContract } from "./registry";
import { deployContract } from "ethereum-waffle";
import { BigNumber, Contract } from "ethers";
import {
  deployTokens,
  deriveBondName,
  deriveSyntheticName,
  transferOwnership,
} from "./token";
import { deriveOracleName, oracleDeploy } from "./oracle";
import {
  addTokens,
  bindTokens,
  deployTreasury,
  setTreasuryLinks,
} from "./treasury";
import { task } from "hardhat/config";
import { addLiquidity, getUniswapRouter } from "./uniswap";

const INITIAL_LIQUIDITY = ETH.mul(100);

task("main:deploy", "Deploys the system").setAction(async (_, hre) => {
  await deploy(hre);
});

export async function deploy(hre: HardhatRuntimeEnvironment) {
  const underlyingName = "WBTC";
  const bondName = deriveBondName(underlyingName);
  const syntheticName = deriveSyntheticName(underlyingName);
  const { klon, jedi, droid } = await deployTokens(
    hre,
    underlyingName,
    INITIAL_LIQUIDITY
  );
  await addLiquidity(hre, underlyingName, syntheticName, BTC, ETH);
  await oracleDeploy(hre, underlyingName, syntheticName);
  const oracleName = deriveOracleName(underlyingName, syntheticName);
  await deployTreasury(hre, 1);

  const swapPool = await contractDeploy(
    hre,
    "SwapPool",
    "KlonDroidSwapPool",
    klon.address,
    droid.address,
    await now(hre),
    0
  );
  await transferOwnership(hre, "Klon", swapPool.address);
  await transferOwnership(hre, "Droid", swapPool.address);

  await deployLockPool(hre, klon, droid);

  // await setTreasuryLinks(hre, 1, 1, 1);
  // await addTokens(hre, 1, syntheticName, underlyingName, bondName, oracleName);
  // await bindTokens(hre, 1, 1, syntheticName, bondName);
}

async function deployLockPool(
  hre: HardhatRuntimeEnvironment,
  klon: Contract,
  droid: Contract
) {
  const lockPool = await contractDeploy(
    hre,
    "LockPool",
    "DroidJediLockPool",
    klon.address,
    droid.address,
    await now(hre)
  );
  await setRewardFactor(hre, lockPool, 7, 100);
  await setRewardFactor(hre, lockPool, 30, 150);
  await setRewardFactor(hre, lockPool, 90, 200);
  await setRewardFactor(hre, lockPool, 180, 250);
  await setRewardFactor(hre, lockPool, 365, 300);
  await setRewardFactor(hre, lockPool, 1460, 450);
  await transferOwnership(hre, "Jedi", lockPool.address);
  return lockPool;
}

async function setRewardFactor(
  hre: HardhatRuntimeEnvironment,
  pool: Contract,
  days: number,
  factor: number
) {
  console.log(`Setting reward ${days} to ${factor}`);
  const existingFactor = await pool.rewardFactor(days);
  if (existingFactor > 0) {
    console.log(`Factor is at ${existingFactor} already, skipping...`);
    return;
  }
  const tx = await pool.populateTransaction.setRewardFactor(days, factor);
  await sendTransaction(hre, tx);
  console.log("Done");
}
