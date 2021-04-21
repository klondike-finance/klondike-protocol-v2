import { BigNumber, PopulatedTransaction } from "ethers";
import { keccak256 } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export const BTC = BigNumber.from(10).pow(8);
export const ETH = BigNumber.from(10).pow(18);

export async function now(hre: HardhatRuntimeEnvironment): Promise<number> {
  const { timestamp } = await hre.ethers.provider.getBlock("latest");
  return timestamp;
}

export async function sendTransaction(
  hre: HardhatRuntimeEnvironment,
  tx: PopulatedTransaction
) {
  console.log("Sending transaction to the pool...");

  const [operator] = await hre.ethers.getSigners();
  const txResp = await operator.sendTransaction(tx);
  console.log(
    `Sent transaction with hash \`${txResp.hash}\`. Waiting confirmation`
  );
  await txResp.wait(2);
  console.log("Transaction confirmed");
}

export function isProd(hre: HardhatRuntimeEnvironment) {
  return hre.network.name === "mainnet";
}

export function pairFor(factory: string, token0: string, token1: string) {
  const [tokenA, tokenB] =
    token0.toLowerCase() < token1.toLowerCase()
      ? [token0, token1]
      : [token1, token0];
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

export function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
