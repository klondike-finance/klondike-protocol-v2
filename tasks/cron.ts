import { Contract } from "@ethersproject/contracts";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { findExistingContract } from "./contract";

task("cron:tick").setAction(async ({}, hre: HardhatRuntimeEnvironment) => {
  const tokenManager = await findExistingContract(hre, "TokenManagerV1");
  const emissionManager = await findExistingContract(hre, "EmissionManagerV1");
  const tokens = await tokenManager.allTokens();
  for (const token of tokens) {
    await tokenTick(hre, token, tokenManager, emissionManager);
  }
});

async function tokenTick(
  hre: HardhatRuntimeEnvironment,
  token: string,
  tokenManager: Contract,
  emissionManager: Contract
) {
  const [_syn, _under, _pair, oracleAddress] = await tokenManager.tokenIndex(
    token
  );
  const oracleDefault = await findExistingContract(hre, "KWBTCWBTCOracle");
  console.log(oracleDefault);

  const oracle = new Contract(oracleAddress, oracleDefault.abi);
  const oracleLastCalled = await oracle.lastCalled();
  const oracleLastCalledDate = new Date(oracleLastCalled * 1000);
  console.log(oracleLastCalledDate);
}
