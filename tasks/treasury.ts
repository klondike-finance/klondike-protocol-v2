import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy, findExistingContract } from "./contract";
import { getUniswapFactory } from "./uniswap";
import { sendTransaction } from "./utils";

export async function deployTreasury(
  hre: HardhatRuntimeEnvironment,
  version: number,
  start: number = Math.floor(new Date().getTime() / 1000),
  debouncePeriod: number
) {
  const factory = await getUniswapFactory(hre);
  const tokenManager = await contractDeploy(
    hre,
    "TokenManager",
    `TokenManagerV${version}`,
    factory.address
  );
  const bondManager = await contractDeploy(
    hre,
    "BondManager",
    `BondManagerV${version}`,
    start
  );
  const emissionManager = await contractDeploy(
    hre,
    "EmissionManager",
    `EmissionManagerV${version}`,
    start,
    debouncePeriod
  );
}

export async function setTreasuryLinks(
  hre: HardhatRuntimeEnvironment,
  tokenManagerVersion: number,
  bondManagerVersion: number,
  emissionManagerVersion: number
) {
  console.log(`Setting treasury links`);

  const tokenManager = await findExistingContract(
    hre,
    `TokenManagerV${tokenManagerVersion}`
  );
  const bondManager = await findExistingContract(
    hre,
    `BondManagerV${bondManagerVersion}`
  );
  const emissionManager = await findExistingContract(
    hre,
    `EmissionManagerV${emissionManagerVersion}`
  );

  const [op] = await hre.ethers.getSigners();
  for (const contract of [tokenManager, bondManager, emissionManager]) {
    const operator = await contract.operator();
    if (op.address.toLowerCase() != operator.toLowerCase()) {
      console.log(
        `Cannot set treasury links since ${contract.address} operator is ${operator}, not ${op.address}. Skipping...`
      );
      return;
    }
  }

  let tx;
  console.log(`Setting bond manager for token manager`);
  if (
    (await tokenManager.bondManager()).toLowerCase() !==
    bondManager.address.toLowerCase()
  ) {
    tx = await tokenManager.populateTransaction.setBondManager(
      bondManager.address
    );
    await sendTransaction(hre, tx);
  }
  console.log(`Setting emission manager for token manager`);
  if (
    (await tokenManager.emissionManager()).toLowerCase() !==
    emissionManager.address.toLowerCase()
  ) {
    tx = await tokenManager.populateTransaction.setEmissionManager(
      emissionManager.address
    );
    await sendTransaction(hre, tx);
  }
  console.log(`Setting token manager for bond manager`);
  if (
    (await bondManager.tokenManager()).toLowerCase() !==
    tokenManager.address.toLowerCase()
  ) {
    tx = await bondManager.populateTransaction.setTokenManager(
      tokenManager.address
    );
    await sendTransaction(hre, tx);
  }
  console.log(`Setting bond manager for emission manager`);
  if (
    (await emissionManager.bondManager()).toLowerCase() !==
    bondManager.address.toLowerCase()
  ) {
    tx = await emissionManager.populateTransaction.setBondManager(
      bondManager.address
    );
    await sendTransaction(hre, tx);
  }
  console.log(`Setting token manager for emission manager`);
  if (
    (await emissionManager.tokenManager()).toLowerCase() !==
    tokenManager.address.toLowerCase()
  ) {
    tx = await emissionManager.populateTransaction.setTokenManager(
      tokenManager.address
    );
    await sendTransaction(hre, tx);
  }
  console.log(`Done`);
}

export async function addTokens(
  hre: HardhatRuntimeEnvironment,
  tokenManagerVersion: number,
  syntheticName: string,
  underlyingName: string,
  bondName: string,
  oracleName: string
) {
  console.log(`Adding tokens for ${underlyingName}`);

  const tokenManager = await findExistingContract(
    hre,
    `TokenManagerV${tokenManagerVersion}`
  );
  const synthetic = await findExistingContract(hre, syntheticName);
  const bond = await findExistingContract(hre, bondName);
  const underlying = await findExistingContract(hre, underlyingName);
  const oracle = await findExistingContract(hre, oracleName);
  const isManaged = await tokenManager.isManagedToken(synthetic.address);
  if (isManaged) {
    console.log("Token is already managed, skipping...");
    return;
  }
  const tx = await tokenManager.populateTransaction.addToken(
    synthetic.address,
    bond.address,
    underlying.address,
    oracle.address
  );
  await sendTransaction(hre, tx);
  console.log("Done");
}

export async function bindTokens(
  hre: HardhatRuntimeEnvironment,
  tokenManagerVersion: number,
  bondManagerVersion: number,
  syntheticName: string,
  bondName: string
) {
  console.log("Binding tokens");

  const tokenManager = await findExistingContract(
    hre,
    `TokenManagerV${tokenManagerVersion}`
  );
  const bondManager = await findExistingContract(
    hre,
    `BondManagerV${bondManagerVersion}`
  );
  const synthetic = await findExistingContract(hre, syntheticName);
  const bond = await findExistingContract(hre, bondName);
  let tx;
  tx = await synthetic.populateTransaction.transferOperator(
    tokenManager.address
  );
  await sendTransaction(hre, tx);
  tx = await synthetic.populateTransaction.transferOwnership(
    tokenManager.address
  );
  await sendTransaction(hre, tx);
  tx = await bond.populateTransaction.transferOperator(bondManager.address);
  await sendTransaction(hre, tx);
  tx = await bond.populateTransaction.transferOwnership(bondManager.address);
  await sendTransaction(hre, tx);
  console.log("Done");
}
