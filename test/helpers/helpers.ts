import { Block, JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";
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
