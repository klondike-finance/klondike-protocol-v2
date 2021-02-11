import { BigNumber, PopulatedTransaction } from "ethers";
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
  await txResp.wait();
  console.log("Transaction confirmed");
}

export function isProd(hre: HardhatRuntimeEnvironment) {
  return hre.network.name === "mainnet";
}
