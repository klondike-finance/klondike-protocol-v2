import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/config";
import { config as dotenv } from "dotenv";
import "./tasks/oracle";

dotenv();

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    dev: {
      url: "http://localhost:8545",
    },
    kovan: {
      url: process.env["TEST_INFURA_ENDPOINT"] || "",
      accounts: [process.env["TEST_OPERATOR_PK"] || ""],
    },
    mainnet: {
      url: process.env["INFURA_ENDPOINT"] || "",
      accounts: [process.env["OPERATOR_PK"] || ""],
    },
  },

  solidity: {
    compilers: [
      {
        version: "0.6.6",
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
  etherscan: {
    apiKey: process.env["ETHERSCAN_API_KEY"],
  },
};

export default config;
