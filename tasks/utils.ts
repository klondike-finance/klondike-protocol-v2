import { BigNumber, Contract, ContractFactory } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";

export const BTC = BigNumber.from(10).pow(8);
export const ETH = BigNumber.from(10).pow(18);

export async function now(hre: HardhatRuntimeEnvironment): Promise<number> {
  const { timestamp } = await hre.ethers.provider.getBlock("latest");
  return timestamp;
}

export const UniswapV2Factory = new ContractFactory(
  UniswapV2FactoryBuild.abi,
  UniswapV2FactoryBuild.bytecode
);
export const UniswapV2Router = new ContractFactory(
  UniswapV2RouterBuild.abi,
  UniswapV2RouterBuild.bytecode
);

export const UNISWAP_V2_FACTORY_ADDRESS =
  "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
export const UNISWAP_V2_ROUTER_ADDRESS =
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

export async function getUniswapFactory(
  hre: HardhatRuntimeEnvironment
): Promise<Contract> {
  return await hre.ethers.getContractAt(
    UniswapV2FactoryBuild.abi,
    UNISWAP_V2_FACTORY_ADDRESS
  );
}

export async function getUniswapRouter(
  hre: HardhatRuntimeEnvironment
): Promise<Contract> {
  return await hre.ethers.getContractAt(
    UniswapV2RouterBuild.abi,
    UNISWAP_V2_ROUTER_ADDRESS
  );
}
