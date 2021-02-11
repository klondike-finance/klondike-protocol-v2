import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, Wallet } from "ethers";
import { getContractAddress } from "ethers/lib/utils";
import {
  getAllRegistryContracts,
  getRegistryContract,
  initRegistry,
  updateRegistry,
} from "./registry";
import { writeFileSync } from "fs";
import { ethers } from "hardhat";
import https from "https";
import axios from "axios";

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

task("contract:verify", "Verifies contracts")
  .addVariadicPositionalParam(
    "namesOrAddresses",
    "Names of the contract in registry or addresses in registry"
  )
  .setAction(async ({ namesOrAddresses }, hre) => {
    for (const name of namesOrAddresses) {
      await contractVerify(hre, name);
    }
  });

task("contract:verify:all", "Verifies contracts").setAction(
  async ({ namesOrAddresses }, hre) => {
    await contractVerifyAll(hre);
  }
);

export async function contractDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  registryName: string,
  ...args: Array<any>
): Promise<Contract> {
  const entry = await getRegistryContract(hre, registryName);
  if (entry) {
    const contract = await hre.ethers.getContractAt(name, entry.address);
    console.log(
      `Prefetched contract ${registryName} at address ${entry.address}`
    );

    return contract;
  }
  return await contractHardDeploy(hre, name, registryName, ...args);
}

export async function findExistingContract(
  hre: HardhatRuntimeEnvironment,
  registryName: string
): Promise<Contract> {
  const entry = await getRegistryContract(hre, registryName);
  if (!entry) {
    throw `Contract \`${registryName}\` not found in the registry`;
  }
  const contract = await hre.ethers.getContractAt(entry.name, entry.address);
  return contract;
}

export async function contractHardDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  registryName: string,
  ...args: Array<any>
): Promise<Contract> {
  console.log(
    `Deploying contract \`${name}\` with name \`${registryName}\` and args: ${args}...`
  );
  const [operator] = await hre.ethers.getSigners();
  const factory = (await hre.ethers.getContractFactory(name)).connect(operator);
  const tx = factory.getDeployTransaction(...args);
  console.log("Sending transaction to the pool...");
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

async function contractVerifyAll(hre: HardhatRuntimeEnvironment) {
  const contracts = getAllRegistryContracts(hre);
  for (const contract of contracts) {
    try {
      await contractVerify(hre, contract);
    } catch (e) {
      console.log(e);
    }
  }
}

async function contractVerified(
  hre: HardhatRuntimeEnvironment,
  address: string
) {
  const domain =
    hre.network.name === "mainnet" ? "api" : `api-${hre.network.name}`;
  const url = `https://${domain}.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${hre.config.etherscan.apiKey}`;
  const abiResponse = await axios.get(url);
  const status = abiResponse.data.status;
  return status.toString() === "1";
}

async function contractVerify(
  hre: HardhatRuntimeEnvironment,
  contractNameOrAddress: string
) {
  const entry = await getRegistryContract(hre, contractNameOrAddress);
  if (!entry) {
    throw `Contract \`${contractNameOrAddress}\` not found in registry`;
  }
  if (await contractVerified(hre, entry.address)) {
    console.log("Already verified - skipping");
    return;
  }

  console.log(
    `Verifying contract \`${entry.name}\` with name \`${entry.registryName}\` at address \`${entry.address}\``
  );
  const argsContent = `module.exports = JSON.parse('${JSON.stringify(
    entry.args
  )}')`;
  const constructorArgsPath = `/tmp/verifyArgs${entry.registryName}.js`;
  writeFileSync(constructorArgsPath, argsContent);
  try {
    await hre.run("verify", {
      address: entry.address,
      constructorArgs: constructorArgsPath,
    });
  } catch (e) {
    console.log(e);
  }
  console.log("Done");
}
