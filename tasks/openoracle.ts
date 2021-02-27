import { Reporter } from "open-oracle-reporter";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { task, types } from "hardhat/config";
import {
  HardhatNetworkAccountConfig,
  HardhatRuntimeEnvironment,
} from "hardhat/types";
import { findExistingContract } from "./contract";
import { getRegistryContract } from "./registry";
import { sendTransaction } from "./utils";

task("openoracle:update:raw", "Deploys an oracle")
  .addParam("token", "Token name")
  .addParam(
    "price",
    "price (/USD) to push (normalized to 10^6)",
    undefined,
    types.float
  )
  .setAction(async ({ token, price }, hre) => {
    await openoracleUpdateRaw(hre, token, price);
  });

async function openoracleUpdateRaw(
  hre: HardhatRuntimeEnvironment,
  token: string,
  price: number
) {
  const message = Reporter.encode(
    "prices",
    Math.floor(new Date().getTime() / 1000),
    {
      [token]: price,
    }
  )[0];

  //   const message = hre.ethers.utils.defaultAbiCoder.encode(
  //     [
  //       { type: "string" } as any,
  //       { type: "uint64" } as any,
  //       { type: "string" } as any,
  //       { type: "uint64" } as any,
  //     ],
  //     ["prices", Math.floor(new Date().getTime() / 1000), key, priceStr]
  //   );
  const pk = (hre.network.config.accounts as any[])[0];

  const { signature } = Reporter.sign(message, pk)[0];
  const openoraclePriceData = await findExistingContract(
    hre,
    "OpenOraclePriceDataV1"
  );
  const tx = await openoraclePriceData.populateTransaction.put(
    message,
    signature
  );
  console.log("Message:", message);
  console.log("Signature:", signature);

  await sendTransaction(hre, tx);
}

// export function sign(messages: string | string[], privateKey: string): SignedMessage[] {
//     const actualMessages = Array.isArray(messages) ? messages : [messages];
//     return actualMessages.map((message) => {
//       const hash = web3.utils.keccak256(message);
//       const {r, s, v} = web3.eth.accounts.sign(hash, privateKey);
//       const signature = web3.eth.abi.encodeParameters(['bytes32', 'bytes32', 'uint8'], [r, s, v]);
//       const signatory = web3.eth.accounts.recover(hash, v, r, s);
//       return {hash, message, signature, signatory};
//     });
//   }
