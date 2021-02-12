import { writeFileSync } from "fs";
import { task } from "hardhat/config";
import { getAllRegistryContracts, getRegistryContract } from "./registry";

task("abi:generate").setAction(async (_, hre) => {
  const contracts = getAllRegistryContracts(hre);
  const res: { [key: string]: any } = {};
  for (const registryName of contracts) {
    const { address, name } = getRegistryContract(hre, registryName);
    const artifact = await hre.artifacts.readArtifact(name);
    res[registryName] = { address, abi: artifact.abi };
    writeFileSync(
      `${__dirname}/../tmp/deployments.${hre.network.name}.json`,
      JSON.stringify(res, null, 2)
    );
  }
});
