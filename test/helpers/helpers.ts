import { Block, JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import UniswapV2FactoryBuild from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2RouterBuild from "@uniswap/v2-periphery/build/UniswapV2Router02.json";

export const BTC = BigNumber.from(10).pow(8);
export const ETH = BigNumber.from(10).pow(18);

export async function fastForward(
  provider: JsonRpcProvider,
  time: number
): Promise<void> {
  return provider.send("evm_increaseTime", [time]);
}

export async function mine(provider: JsonRpcProvider): Promise<Block> {
  await provider.send("evm_mine", []);
  return await provider.getBlock("latest");
}

export async function fastForwardAndMine(
  provider: JsonRpcProvider,
  time: number
): Promise<Block> {
  await fastForward(provider, time);
  await mine(provider);
  return Promise.resolve(provider.getBlock("latest"));
}

export async function now(): Promise<number> {
  const { timestamp } = await ethers.provider.getBlock("latest");
  return timestamp;
}

export async function deployToken(
  tokenFactory: ContractFactory,
  uniswapRouter: Contract,
  name: string,
  decimals: number
): Promise<Contract> {
  const token = await tokenFactory.deploy(name, name, decimals);
  const [operator] = await ethers.getSigners();
  const supply = BigNumber.from(10).pow(decimals + 6);
  await token.mint(operator.address, supply);
  await token.approve(uniswapRouter.address, supply);
  return token;
}

export async function deployUniswap() {
  const [operator] = await ethers.getSigners();
  const UniswapV2Factory = new ContractFactory(
    UniswapV2FactoryBuild.abi,
    UniswapV2FactoryBuild.bytecode
  ).connect(operator);
  const UniswapV2Router = new ContractFactory(
    UniswapV2RouterBuild.abi,
    UniswapV2RouterBuild.bytecode
  ).connect(operator);

  const factory = await UniswapV2Factory.deploy(operator.address);
  const router = await UniswapV2Router.deploy(
    factory.address,
    operator.address
  );
  return {
    factory,
    router,
  };
}

export async function addUniswapPair(
  factory: Contract,
  router: Contract,
  nameUnderlying: string,
  decimalsUnderlying: number,
  nameSynthetic: string,
  decimalsSynthetic: number
) {
  const [operator] = await ethers.getSigners();
  const SyntheticTokenFactory = await ethers.getContractFactory(
    "SyntheticToken"
  );

  const underlying = await deployToken(
    SyntheticTokenFactory,
    router,
    nameUnderlying,
    decimalsUnderlying
  );
  const synthetic = await deployToken(
    SyntheticTokenFactory,
    router,
    nameSynthetic,
    decimalsSynthetic
  );
  const pair = await ethers.getContractAt(
    "IUniswapV2Pair",
    pairFor(factory.address, underlying.address, synthetic.address)
  );
  await router.addLiquidity(
    underlying.address,
    synthetic.address,
    BigNumber.from(10).pow(decimalsUnderlying + 1),
    BigNumber.from(10).pow(decimalsSynthetic + 1),
    BigNumber.from(10).pow(decimalsUnderlying + 1),
    BigNumber.from(10).pow(decimalsSynthetic + 1),
    operator.address,
    (await now()) + 1000000
  );
  return {
    underlying,
    synthetic,
    pair,
  };
}

export function pairFor(factory: string, token0: string, token1: string) {
  const [tokenA, tokenB] =
    token0 < token1 ? [token0, token1] : [token1, token0];
  return (
    "0x" +
    keccak256(
      "0xff" +
        factory.slice(2) +
        keccak256("0x" + tokenA.slice(2) + tokenB.slice(2)).slice(2) +
        "96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f"
    ).slice(26)
  );
}
