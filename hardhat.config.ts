import "@nomiclabs/hardhat-waffle";
import "solidity-coverage";
import { task, HardhatUserConfig } from "hardhat/config";

// import ethers from "ethers";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  // const accounts = await ethers.getSigners();
  // for (const account of accounts) {
  //   console.log(account.address);
  // }
});

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
};

export default config;
