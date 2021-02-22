import { writeFileSync } from "fs";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getAllRegistryContracts, getRegistryContract } from "./registry";
import deploymentsV1Kovan from "../tmp/deployments.v1.kovan.json";
import deploymentsV1Mainnet from "../tmp/deployments.v1.mainnet.json";
import deploymentsV2Kovan from "../tmp/deployments.kovan.json";
import deploymentsV2Mainnet from "../tmp/deployments.mainnet.json";
import { isProd } from "./utils";
import { ethers } from "ethers";
import { loadFixture } from "ethereum-waffle";

const DEFAULT_TIMELOCK_DELAY = 300;

task("multisig:generate")
  .addParam(
    "name",
    "The name of the contract (i.e. resistry name)",
    undefined,
    types.string
  )
  .addParam("method", "The name of the method", undefined, types.string)
  .addOptionalVariadicPositionalParam("args", "Arguments for the call")
  .setAction(async ({ name, method, args = [] }, hre) => {
    const targs = transformArgs(args);
    const { calldata, address } = await getCallData(hre, name, method, targs);
    console.log("Contract:");
    console.log(getMultisig(hre));
    console.log("-----------------------");
    console.log("Address:");
    console.log(address);
    console.log(`Data:`);
    console.log(calldata);
  });

task("multisig:timelock")
  .addParam(
    "eta",
    "Time for execution in secs",
    Math.floor(new Date().getTime() / 1000) + DEFAULT_TIMELOCK_DELAY,
    types.int
  )
  .addParam(
    "timelockMethod",
    "queueTransaction | executeTransaction",
    undefined,
    types.string
  )
  .addParam(
    "name",
    "The name of the contract (i.e. resistry name)",
    undefined,
    types.string
  )
  .addParam("method", "The name of the method", undefined, types.string)
  .addOptionalVariadicPositionalParam("args", "Arguments for the call")
  .setAction(async ({ name, method, eta, timelockMethod, args = [] }, hre) => {
    const targs = transformArgs(args);
    const { calldata, address, signature } = await timelockGenerate(
      hre,
      timelockMethod,
      eta,
      name,
      method,
      targs
    );
    console.log("Contract:");
    console.log(getMultisig(hre));
    console.log("-----------------------");
    console.log("");
    console.log(`Signature: ${signature}`);
    console.log(`Args: ${JSON.stringify(targs)}`);
    console.log(`Eta: ${eta}`);
    console.log("");
    console.log("-----------------------");
    console.log("Address:");
    console.log(address);
    console.log(`Data:`);
    console.log(calldata);
  });

function getMultisig(hre: HardhatRuntimeEnvironment) {
  const contracts = getMergedContracts(hre) as any;
  const url = isProd(hre)
    ? "https://etherscan.io"
    : "https://kovan.etherscan.io";
  return `${url}/address/${contracts["MultiSigWallet"].address}#writeContract`;
}

async function getCallData(
  hre: HardhatRuntimeEnvironment,
  name: string,
  methodName: string,
  args: any[]
) {
  const contracts = getMergedContracts(hre) as any;
  const contractEntry = contracts[name];
  if (!contractEntry) {
    console.log(`Contract ${name} not found`);
  }
  const contract = new ethers.Contract(
    contractEntry.address,
    contractEntry.abi
  );
  const method = contract.populateTransaction[methodName];
  if (!method) {
    console.log(`Method ${methodName} not found`);
    return {};
  }
  const calldata = (await method(...args)).data;
  const methodABI = contractEntry.abi.find((x: any) => x.name === methodName);
  const signature = `${methodName}(${(methodABI.inputs || [])
    .map((x: any) => x.type)
    .join(",")})`;

  return { calldata, address: contractEntry.address, signature };
}

async function timelockGenerate(
  hre: HardhatRuntimeEnvironment,
  timelockMethod: string,
  eta: number,
  name: string,
  methodName: string,
  args: any[]
) {
  const contracts = getMergedContracts(hre) as any;
  const timelock = new ethers.Contract(
    contracts["Timelock"].address,
    contracts["Timelock"].abi
  );
  const { address, calldata, signature } = await getCallData(
    hre,
    name,
    methodName,
    args
  );
  if (!calldata) {
    console.log(`Could not create calldata`);
    return {};
  }
  const timelockData = `0x${calldata.slice(10)}`; //remove method hash

  const method = timelock.populateTransaction[timelockMethod];
  if (!method) {
    console.log(`Method ${timelockMethod} not found on Timelock`);
    return {};
  }
  const data = (await method(address, 0, signature, timelockData, eta)).data;
  return { calldata: data, address: timelock.address, signature };
}

function getMergedContracts(hre: HardhatRuntimeEnvironment) {
  return isProd(hre)
    ? { ...deploymentsV1Mainnet, ...deploymentsV2Mainnet }
    : { ...deploymentsV1Kovan, ...deploymentsV2Kovan };
}

function transformArgs(args: any[]) {
  return args.map((x: any) => {
    let res;
    try {
      res = JSON.parse(x);
      if (!Array.isArray(res)) {
        res = x;
      }
    } catch (e) {
      res = x;
    }
    return res;
  });
}