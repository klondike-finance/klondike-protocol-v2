import { ContractFactory } from "ethers";
import { ethers } from "hardhat";

describe("TokenManagerMock", () => {
  describe("#constructor", () => {
    it("creates a tokenManager mock", async () => {
      const TokenManagerMock = await ethers.getContractFactory(
        "TokenManagerMock"
      );
      const t = await TokenManagerMock.deploy();
      await t.allTokens();
      await t.addToken(ethers.constants.AddressZero);
      await t.isManagedToken(ethers.constants.AddressZero);
      await t.underlyingToken(ethers.constants.AddressZero);
      await t.averagePrice(ethers.constants.AddressZero, 0);
      await t.currentPrice(ethers.constants.AddressZero, 0);
      await t.updateOracle(ethers.constants.AddressZero);
      await t.burnSyntheticFrom(
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0
      );
      await t.mintSynthetic(
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0
      );
      await t.oneSyntheticUnit(ethers.constants.AddressZero);
      await t.oneUnderlyingUnit(ethers.constants.AddressZero);
    });
  });
});
