import { BigNumber, Contract, ContractFactory } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import { getRegistryContract } from "./registry";
import { now, sendTransaction } from "./utils";

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
  hre: HardhatRuntimeEnvironment,
  address?: string
): Promise<Contract> {
  return await hre.ethers.getContractAt(
    UniswapV2FactoryBuild.abi,
    address || UNISWAP_V2_FACTORY_ADDRESS
  );
}

export async function getUniswapRouter(
  hre: HardhatRuntimeEnvironment,
  address?: string
): Promise<Contract> {
  return await hre.ethers.getContractAt(
    UniswapV2RouterBuild.abi,
    address || UNISWAP_V2_ROUTER_ADDRESS
  );
}

export async function addLiquidity(
  hre: HardhatRuntimeEnvironment,
  registryNameOrAddressA: string,
  registryNameOrAddressB: string,
  amountA: BigNumber,
  amountB: BigNumber,
  receiver?: string,
  routerAddress: string = UNISWAP_V2_ROUTER_ADDRESS
) {
  const tokenA = getRegistryContract(hre, registryNameOrAddressA);
  const tokenB = getRegistryContract(hre, registryNameOrAddressB);
  const tokenAAddress = (tokenA && tokenA.address) || registryNameOrAddressA;
  const tokenBAddress = (tokenB && tokenB.address) || registryNameOrAddressB;
  const tokenAName = (tokenA && tokenA.registryName) || registryNameOrAddressA;
  const tokenBName = (tokenB && tokenB.registryName) || registryNameOrAddressB;

  console.log(
    `Adding liquidity to \`${tokenAName}\` - \`${tokenBName}\` UniPool...`
  );
  const [operator] = await hre.ethers.getSigners();
  const to = receiver || operator.address;

  const router = await getUniswapRouter(hre, routerAddress);
  const tx = await router.populateTransaction.addLiquidity(
    tokenAAddress,
    tokenBAddress,
    amountA,
    amountB,
    amountA,
    amountB,
    to,
    (await now(hre)) + 180
  );
  await sendTransaction(hre, tx);
  console.log("Done");
}
