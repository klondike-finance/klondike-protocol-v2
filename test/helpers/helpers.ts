import { Block, JsonRpcProvider } from "@ethersproject/providers";

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
