import { BigNumber, Contract, ContractFactory } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import { getRegistryContract } from "./registry";
import { now, sendTransaction } from "./utils";
import { contractDeploy } from "./contract";
import { ethers } from "hardhat";

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
  if (hre.network.name === "hardhat") {
    return await contractDeploy(
      hre,
      "UniswapV2Factory",
      "UniswapFactory",
      hre.ethers.constants.AddressZero
    );
  }
  return await hre.ethers.getContractAt(
    UniswapV2FactoryBuild.abi,
    UNISWAP_V2_FACTORY_ADDRESS
  );
}

export async function getUniswapRouter(
  hre: HardhatRuntimeEnvironment
): Promise<Contract> {
  if (hre.network.name === "hardhat") {
    const factory = await getUniswapFactory(hre);
    return await contractDeploy(
      hre,
      "UniswapV2Router02",
      "UniswapRouter",
      factory.address,
      hre.ethers.constants.AddressZero
    );
  }
  return await hre.ethers.getContractAt(
    UniswapV2RouterBuild.abi,
    UNISWAP_V2_ROUTER_ADDRESS
  );
}

export async function approveUniswap(
  hre: HardhatRuntimeEnvironment,
  registryNameOrAddressToken: string
) {
  const [operator] = await hre.ethers.getSigners();
  const tokenRegistry = getRegistryContract(hre, registryNameOrAddressToken);
  console.log(`Approving token ${tokenRegistry.registryName} for Uniswap...`);
  const token: Contract = await hre.ethers.getContractAt(
    tokenRegistry.name,
    tokenRegistry.address
  );
  const router = await getUniswapRouter(hre);

  const allowance = await token.allowance(operator.address, router.address);
  if (allowance > 0) {
    console.log("Allowance is set, skipping...");
  }
  await token.approve(router.address, hre.ethers.constants.MaxUint256);
  console.log("Done");
}

export async function addLiquidity(
  hre: HardhatRuntimeEnvironment,
  registryNameOrAddressA: string,
  registryNameOrAddressB: string,
  amountA: BigNumber,
  amountB: BigNumber,
  receiver?: string
) {
  const tokenA = getRegistryContract(hre, registryNameOrAddressA);
  const tokenB = getRegistryContract(hre, registryNameOrAddressB);
  const tokenAAddress = (tokenA && tokenA.address) || registryNameOrAddressA;
  const tokenBAddress = (tokenB && tokenB.address) || registryNameOrAddressB;
  const tokenAName = (tokenA && tokenA.registryName) || registryNameOrAddressA;
  const tokenBName = (tokenB && tokenB.registryName) || registryNameOrAddressB;
  console.log(
    `Adding liquidity to \`${tokenAName}\` - \`${tokenBName}\` UniPool: ${amountA.toString()} - ${amountB.toString()}...`
  );
  const factory = await getUniswapFactory(hre);
  const pair = await factory.getPair(tokenAAddress, tokenBAddress);
  if (pair != hre.ethers.constants.AddressZero) {
    console.log("Pair already exists, skipping.");
    return;
  }
  await approveUniswap(hre, registryNameOrAddressA);
  await approveUniswap(hre, registryNameOrAddressB);

  const [operator] = await hre.ethers.getSigners();
  const to = receiver || operator.address;

  const router = await getUniswapRouter(hre);
  console.log("Calling actual addLiquidity...");

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
