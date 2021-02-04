import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy } from "./contract";
import { tokenDeploy } from "./token";
import {
  BTC,
  ETH,
  getUniswapRouter,
  now,
  UNISWAP_V2_FACTORY_ADDRESS,
} from "./utils";

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
  .setAction(async ({ factory, tokenA, tokenB, period, start }, hre) => {
    await oracleDeploy(hre, factory, tokenA, tokenB, period, start);
  });

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
  return await contractDeploy(
    hre,
    "Oracle",
    factory,
    tokenA,
    tokenB,
    period,
    start
  );
}

export async function oracleDeployMock(hre: HardhatRuntimeEnvironment) {
  const [operator] = await hre.ethers.getSigners();
  const tokenA = await tokenDeploy(hre, "Stable", "STB", 8);
  const tokenB = await tokenDeploy(hre, "Synthetic", "SYN", 18);
  await tokenA.mint(operator, BTC.mul(100));
  await tokenB.mint(operator, ETH.mul(100));
  const router = await getUniswapRouter(hre);
  await router.addLiquidity(
    tokenA.address,
    tokenB.address,
    BTC,
    ETH,
    BTC,
    ETH,
    operator.address,
    (await now(hre)) + 100
  );
  return await oracleDeploy(hre, tokenA.address, tokenB.address);
}
