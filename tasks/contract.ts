import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import { getContractAddress } from "ethers/lib/utils";
import { initRegistry, updateRegistry } from "./registry";

task("contract:deploy", "Deploys a contract")
  .addParam("name", "The name of the contract", undefined, types.string)
  .addVariadicPositionalParam("args", "Arguments for deploy")
  .setAction(async ({ name, args }, hre) => {
    await contractDeploy(hre, name, ...args);
  });

export async function contractDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  ...args: Array<any>
): Promise<Contract> {
  console.log(`Deploying contract \`${name}\`...`);
  initRegistry(hre);
  const [operator] = await hre.ethers.getSigners();
  const factory = (await hre.ethers.getContractFactory(name)).connect(operator);
  const tx = factory.getDeployTransaction(...args);
  const txResp = await operator.sendTransaction(tx);
  const address = getContractAddress(txResp);
  console.log(
    `Sent tx \`${txResp.hash}\` to the pool. Waiting 1 confirmation...`
  );
  await txResp.wait();
  console.log(`Successfully deployed at \`${address}\``);
  updateRegistry(hre, name, { address, args });

  return await hre.ethers.getContractAt(name, address);
}
