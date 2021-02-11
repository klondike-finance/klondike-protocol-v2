import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy, findExistingContract } from "./contract";
import { BTC, ETH, isProd } from "./utils";
import { getRegistryContract } from "./registry";
import { deployContract } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { deployTokens, deriveBondName, deriveSyntheticName } from "./token";
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
  const { underlying, synthetic, bond } = await deployTokens(
    hre,
    underlyingName,
    INITIAL_LIQUIDITY
  );
  await addLiquidity(hre, underlyingName, syntheticName, BTC, ETH);
  const oracle = await oracleDeploy(hre, underlyingName, syntheticName);
  const oracleName = deriveOracleName(underlyingName, syntheticName);
  const { bondManager, emissionManager, tokenManager } = await deployTreasury(
    hre,
    1
  );
  // await setTreasuryLinks(hre, 1, 1, 1);
  await addTokens(hre, 1, syntheticName, underlyingName, bondName, oracleName);
  await bindTokens(hre, 1, 1, syntheticName, bondName);
}
