import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { UNISWAP_V2_FACTORY_ADDRESS } from "../../tasks/uniswap";

describe("BondManager", () => {
  let BondManager: ContractFactory;
  before(async () => {
    BondManager = await ethers.getContractFactory("BondManager");
  });
  describe("#constructor", () => {
    it("creates a bond manager", async () => {
      await expect(BondManager.deploy(UNISWAP_V2_FACTORY_ADDRESS)).to.not.be
        .reverted;
    });
  });
});
