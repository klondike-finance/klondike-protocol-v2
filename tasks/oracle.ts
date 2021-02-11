import { getContractAddress } from "ethers/lib/utils";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy } from "./contract";
import { getRegistryContract } from "./registry";
import { mint, tokenDeploy } from "./token";
import { addLiquidity } from "./uniswap";
import { BTC, ETH } from "./utils";
import { UNISWAP_V2_FACTORY_ADDRESS } from "./uniswap";
import { string } from "hardhat/internal/core/params/argumentTypes";

task("oracle:deploy", "Deploys an oracle")
  .addParam("tokenA", "First token address in the pair")
  .addParam("tokenB", "Second token address in the pair")
  .addParam(
    "factory",
    "UniswapV2Factory address",
    UNISWAP_V2_FACTORY_ADDRESS,
    types.string
  )
  .addParam(
    "start",
    "Start date. Unix timestamp in seconds.",
    Math.floor(new Date().getTime() / 1000),
    types.int
  )
  .addParam("period", "Start date. Unix timestamp in seconds.", 3600, types.int)
  .setAction(
    async (
      { factory, tokenA, tokenB, period, start, tokenAName, tokenBName },
      hre
    ) => {
      await oracleDeploy(hre, tokenA, tokenB, factory, period, start);
    }
  );

task(
  "oracle:deploy:mock",
  "Deploys a mock oracle and two tokens to test"
).setAction(async (_, hre) => {
  await oracleDeployMock(hre);
});

export async function oracleDeploy(
  hre: HardhatRuntimeEnvironment,
  tokenA: string,
  tokenB: string,
  factory: string = UNISWAP_V2_FACTORY_ADDRESS,
  period: number = 3600,
  start: number = Math.floor(new Date().getTime() / 1000)
) {
  const tokenAEntry = getRegistryContract(hre, tokenA);
  const tokenBEntry = getRegistryContract(hre, tokenB);
  if (!tokenAEntry && !tokenBEntry) {
    throw "Oracle: one of the tokens is not deployed yet";
  }
  return await contractDeploy(
    hre,
    "Oracle",
    deriveOracleName(tokenAEntry.registryName, tokenBEntry.registryName),
    factory,
    tokenAEntry.address,
    tokenBEntry.address,
    period,
    start
  );
}

export async function oracleDeployMock(hre: HardhatRuntimeEnvironment) {
  const [operator] = await hre.ethers.getSigners();
  const tokenA = await tokenDeploy(hre, "Stable", "STB", 8);
  const tokenB = await tokenDeploy(hre, "Synthetic", "SYN", 18);
  await mint(hre, tokenA.address, operator.address, BTC.mul(100));
  await mint(hre, tokenB.address, operator.address, ETH.mul(100));
  await addLiquidity(hre, tokenA.address, tokenB.address, BTC, ETH);
  return await oracleDeploy(hre, tokenA.address, tokenB.address);
}

export function deriveOracleName(tokenAName: string, tokenBName: string) {
  const [an, bn] =
    tokenAName > tokenBName
      ? [tokenBName, tokenAName]
      : [tokenAName, tokenBName];
  return `${an}${bn}Oracle`;
}
