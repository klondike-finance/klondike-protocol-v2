import { Block, JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber, Contract } from "ethers";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";

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
