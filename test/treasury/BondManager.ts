import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { assert } from "console";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { UNISWAP_V2_FACTORY_ADDRESS } from "../../tasks/uniswap";
import {
  deployToken,
  deployUniswap,
  addUniswapPair,
  now,
  pairFor,
  BTC,
  fastForwardAndMine,
} from "../helpers/helpers";

describe("BondManager", () => {
  let BondManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let manager: Contract;
  let factory: Contract;
  let router: Contract;
  let pair: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;
  let oracle: Contract;
  let op: SignerWithAddress;
  const SYNTHETIC_DECIMALS = 13;
  const UNDERLYING_DECIMALS = 10;
  const BOND_DECIMALS = 13;
  const INITIAL_MANAGER_BALANCE = BTC.mul(10);
  before(async () => {
    BondManager = await ethers.getContractFactory("BondManager");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
    manager = await BondManager.deploy(factory.address);
    const [operator] = await ethers.getSigners();
    op = operator;
  });
  async function setupUniswap() {
    const { underlying: u, synthetic: s, pair: p } = await addUniswapPair(
      factory,
      router,
      "WBTC",
      UNDERLYING_DECIMALS,
      "KBTC",
      SYNTHETIC_DECIMALS
    );
    underlying = u;
    synthetic = s;
    pair = p;

    oracle = await Oracle.deploy(
      factory.address,
      underlying.address,
      synthetic.address,
      3600,
      await now()
    );
    bond = await deployToken(SyntheticToken, router, "KBOND", BOND_DECIMALS);
    await synthetic.mint(manager.address, INITIAL_MANAGER_BALANCE);
    await underlying.transferOperator(manager.address);
    await underlying.transferOwnership(manager.address);
    await synthetic.transferOperator(manager.address);
    await synthetic.transferOwnership(manager.address);
    await bond.transferOperator(manager.address);
    await bond.transferOwnership(manager.address);
  }

  describe("#constructor", () => {
    it("creates a bond manager", async () => {
      await expect(BondManager.deploy(UNISWAP_V2_FACTORY_ADDRESS)).to.not.be
        .reverted;
    });
  });

  describe("#addToken", () => {
    beforeEach(async () => {
      await setupUniswap();
    });

    describe("when synthetic token operator is TokenManager", () => {
      it("in additinal to TokenManager#addToken it also adds bond token", async () => {
        await expect(
          manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          )
        )
          .to.emit(manager, "BondAdded")
          .withArgs(bond.address);
        expect(await manager.bondDecimals(synthetic.address)).to.eq(
          BOND_DECIMALS
        );
      });
    });
    describe("when bond operator is not BondManager", () => {
      it("fails", async () => {
        const b = await deployToken(
          SyntheticToken,
          router,
          "KBOND",
          BOND_DECIMALS
        );
        await expect(
          manager.addToken(
            synthetic.address,
            b.address,
            underlying.address,
            oracle.address
          )
        ).to.be.revertedWith(
          "BondManager: Token operator and owner of the bond token must be set to TokenManager before adding a token"
        );
        await b.transferOperator(manager.address);
        await expect(
          manager.addToken(
            synthetic.address,
            b.address,
            underlying.address,
            oracle.address
          )
        ).to.be.revertedWith(
          "BondManager: Token operator and owner of the bond token must be set to TokenManager before adding a token"
        );
        await b.transferOwnership(manager.address);
        await expect(
          manager.addToken(
            synthetic.address,
            b.address,
            underlying.address,
            oracle.address
          )
        ).to.not.be.reverted;
      });
    });
    describe("when synthetic token operator is not TokenManager", () => {
      it("fails", async () => {
        const [op, other] = await ethers.getSigners();
        await expect(
          manager
            .connect(other)
            .addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#deleteToken", () => {
    beforeEach(async () => {
      await setupUniswap();
      await manager.addToken(
        synthetic.address,
        bond.address,
        underlying.address,
        oracle.address
      );
      await manager.connect(op);
    });

    describe("when synthetic token operator is TokenManager", () => {
      it("in additinal to TokenManage#deleteToken it also deletes bond token", async () => {
        const [_, other] = await ethers.getSigners();
        await expect(manager.deleteToken(synthetic.address, other.address))
          .to.emit(manager, "BondDeleted")
          .withArgs(bond.address, other.address);
        await expect(
          manager.bondDecimals(synthetic.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
        expect(await bond.operator()).to.eq(other.address);
        expect(await bond.owner()).to.eq(other.address);
        expect(await synthetic.balanceOf(manager.address)).to.eq(0);
        expect(await synthetic.balanceOf(other.address)).to.eq(
          INITIAL_MANAGER_BALANCE
        );
      });
    });
    describe("when synthetic token operator is not TokenManager", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await expect(
          manager.connect(other).deleteToken(synthetic.address, other.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#bondDecimals", () => {
    it("returns decimals of the bond", async () => {
      expect(await manager.bondDecimals(synthetic.address)).to.eq(
        BOND_DECIMALS
      );
    });
    describe("when token is not managed", () => {
      it("fails", async () => {
        await expect(
          manager.bondDecimals(underlying.address)
        ).to.be.revertedWith("Token is not managed");
      });
    });
  });

  describe("#bondPriceUndPerUnitSyn", () => {
    it("returns price of one unit of bonds", async () => {
      expect(await manager.bondPriceUndPerUnitSyn(synthetic.address)).to.eq(
        10 ** UNDERLYING_DECIMALS
      );
      // do some 10 random trades
      for (let i = 0; i < 10; i++) {
        fastForwardAndMine(ethers.provider, 1800);
        const seed = Math.random();
        const synthAmount = BigNumber.from(10)
          .pow(SYNTHETIC_DECIMALS)
          .mul(Math.floor(seed * 10000))
          .div(10000);
        const undAmount = BigNumber.from(10)
          .pow(UNDERLYING_DECIMALS)
          .mul(Math.floor(seed * 10000))
          .div(10000);
        if (seed > 0.5) {
          await router.swapExactTokensForTokens(
            synthAmount,
            0,
            [synthetic.address, underlying.address],
            op.address,
            (await now()) + 1800
          );
        } else {
          await router.swapExactTokensForTokens(
            undAmount,
            0,
            [underlying.address, synthetic.address],
            op.address,
            (await now()) + 1800
          );
        }
        fastForwardAndMine(ethers.provider, 1800);
        await oracle.update();
        const oraclePrice = await oracle.consult(
          synthetic.address,
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS)
        );
        const currentPrice = await manager.currentPrice(
          synthetic.address,
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS)
        );
        expect(await manager.bondPriceUndPerUnitSyn(synthetic.address)).to.eq(
          oraclePrice.gte(currentPrice) ? oraclePrice : currentPrice
        );
      }
    });
    describe("when token is not managed", () => {
      it("fails", async () => {
        await expect(
          manager.bondPriceUndPerUnitSyn(underlying.address)
        ).to.be.revertedWith("Token is not managed");
      });
    });
  });

  describe("#quoteBuyBond", () => {
    it("returns price of bonds for a specific amount of synthetic tokens", async () => {
      await setupUniswap();
      await manager.addToken(
        synthetic.address,
        bond.address,
        underlying.address,
        oracle.address
      );
      await router.swapExactTokensForTokens(
        BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
        0,
        [synthetic.address, underlying.address],
        op.address,
        (await now()) + 1800
      );

      const unitPrice = await manager.bondPriceUndPerUnitSyn(synthetic.address);
      const price = unitPrice.toNumber() / 10 ** UNDERLYING_DECIMALS;
      const amount = 123;
      expect(
        Math.abs(
          (await manager.quoteBonds(synthetic.address, amount)).toNumber() -
            amount / price
        )
      ).to.lte(1);
    });
    describe("when price is greater than 1", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(UNDERLYING_DECIMALS),
          0,
          [underlying.address, synthetic.address],
          op.address,
          (await now()) + 1800
        );
        await oracle.update();
        await fastForwardAndMine(ethers.provider, 1000);
        await expect(
          manager.quoteBonds(synthetic.address, 123)
        ).to.be.revertedWith(
          "BondManager: Synthetic price is not eligible for bond emission"
        );
      });
    });
    describe("when token is not managed", () => {
      it("fails", async () => {
        await expect(
          manager.quoteBonds(underlying.address, 1)
        ).to.be.revertedWith("Token is not managed");
      });
    });
  });

  describe("#buyBonds", () => {
    describe("when price is below 1, synthetics are approved to manager, minAmountBondsOut is good, buyBonds is not paused", () => {
      it("it burns the underlying and mints a bond", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        const initialBalance = await bond.balanceOf(op.address);
        const bondAmount = await manager.quoteBonds(synthetic.address, amount);
        await expect(manager.buyBonds(synthetic.address, amount, bondAmount))
          .to.emit(synthetic, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount)
          .and.to.emit(bond, "Transfer")
          .withArgs(ethers.constants.AddressZero, op.address, bondAmount);
        expect(await bond.balanceOf(op.address)).to.eq(
          initialBalance.add(bondAmount)
        );
      });
    });
    describe("when bonds are paused", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        const initialBalance = await bond.balanceOf(op.address);
        const bondAmount = await manager.quoteBonds(synthetic.address, amount);
        await manager.setPauseBuyBonds(true);
        await expect(
          manager.buyBonds(synthetic.address, amount, bondAmount)
        ).to.be.revertedWith(
          "BondManager: Buying bonds is temporarily suspended"
        );
        await manager.setPauseBuyBonds(false);
      });
    });
    describe("when synthetics are not approved in full to manager", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount - 1);
        await expect(
          manager.buyBonds(synthetic.address, amount, 0)
        ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
      });
    });
    describe("when price is above 1", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await router.swapExactTokensForTokens(
          123,
          0,
          [underlying.address, synthetic.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        await expect(
          manager.buyBonds(synthetic.address, amount, 0)
        ).to.be.revertedWith(
          "BondManager: Synthetic price is not eligible for bond emission"
        );
      });
    });
    describe("when minAmountOut is greater than the actual amount", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        const bondAmount = await manager.quoteBonds(synthetic.address, amount);
        await expect(
          manager.buyBonds(synthetic.address, amount, bondAmount + 1)
        ).to.be.revertedWith(
          "BondManager: number of bonds is less than minAmountBondsOut"
        );
      });
    });
  });

  describe("#sellBonds", () => {
    describe("when there's enough BondManager balance, bonds are approved", () => {
      it("burns the bonds and transfers synthetic", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const amount = 12345;
        await bond.approve(manager.address, amount);
        await expect(manager.sellBonds(synthetic.address, amount, amount))
          .to.emit(bond, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount)
          .and.to.emit(synthetic, "Transfer")
          .withArgs(manager.address, op.address, amount);
      });
    });

    describe("when there's not enough balace", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const managerBalance = await synthetic.balanceOf(manager.address);
        const opBalance = await bond.balanceOf(op.address);
        assert(managerBalance < opBalance);
        await bond.approve(manager.address, managerBalance + 1);
        await expect(
          manager.sellBonds(
            synthetic.address,
            managerBalance + 1,
            managerBalance + 1
          )
        ).to.be.revertedWith(
          "BondManager: Less than minAmountOfSyntheticOut bonds could be sold"
        );
      });
    });

    describe("when bonds are not approved", () => {
      it("fails", async () => {
        await setupUniswap();
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const amount = 12345;
        await bond.approve(manager.address, amount - 1);
        await expect(
          manager.sellBonds(synthetic.address, amount, amount)
        ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
      });
    });
  });

  describe("#setPauseBuyBonds", () => {
    describe("when called by the Operator", () => {
      it("sets pause on selling bonds", async () => {
        const m = await BondManager.deploy(factory.address);
        expect(await m.pauseBuyBonds()).to.eq(false);
        await m.setPauseBuyBonds(true);
        expect(await m.pauseBuyBonds()).to.eq(true);
      });
    });
    describe("when called not by the Operator", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await expect(
          manager.connect(other).setPauseBuyBonds(true)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });
});
