import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import { getContractAddress } from "ethers/lib/utils";
import { initRegistry, updateRegistry } from "./registry";

task("contract:deploy", "Deploys a contract")
  .addParam(
    "name",
    "The name of the contract (i.e. solidity name)",
    undefined,
    types.string
  )
  .addParam(
    "registryName",
    "The name of the contract in the contract registry (e.g. token name)",
    undefined,
    types.string
  )
  .addVariadicPositionalParam("args", "Arguments for deploy")
  .setAction(async ({ name, registryName, args }, hre) => {
    await contractDeploy(hre, name, registryName, ...args);
  });

export async function contractDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  registryName: string,
  ...args: Array<any>
): Promise<Contract> {
  console.log(
    `Deploying contract \`${name}\` with name \`${registryName}\`...`
  );
  const [operator] = await hre.ethers.getSigners();
  const factory = (await hre.ethers.getContractFactory(name)).connect(operator);
  const tx = factory.getDeployTransaction(...args);
  const txResp = await operator.sendTransaction(tx);
  const address = getContractAddress(txResp).toLowerCase();
  console.log(
    `Sent tx \`${txResp.hash}\` to the pool. Waiting 1 confirmation...`
  );
  await txResp.wait();
  console.log(`Successfully deployed at \`${address}\``);
  updateRegistry(hre, registryName, { registryName, name, address, args });

  return await hre.ethers.getContractAt(name, address);
}

// async function verify(hre: HardhatRuntimeEnvironment) {
//   const constructorArgsPath = `${__dirname}/../tmp/verifyArgs${name}.js`;
//   const { address, args = [] } = deployedContracts[name];
//   console.log(
//     `Verifying ${name} @ ${address} with args ${JSON.stringify(args)}`
//   );
//   writeFileSync(
//     constructorArgsPath,
//     `module.exports = ${JSON.stringify(args)}`
//   );
//   try {
//     await hre.run("verify", {
//       address,
//       constructorArgs: constructorArgsPath,
//     });
//   } catch (e) {
//     console.log(e);
//   }
// }
