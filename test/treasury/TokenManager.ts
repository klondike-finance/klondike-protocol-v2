import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
  addUniswapPair,
  deployToken,
  deployUniswap,
  now,
  fastForwardAndMine,
  pairFor,
} from "../helpers/helpers";
import { BTC, ETH } from "../../tasks/utils";

describe("TokenManager", () => {
  let TokenManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let BondManagerMock: ContractFactory;
  let EmissionManagerMock: ContractFactory;
  let factory: Contract;
  let router: Contract;
  let manager: Contract;
  let bondManager: Contract;
  let emissionManager: Contract;
  let op: SignerWithAddress;
  let oracle: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;
  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    TokenManager = await ethers.getContractFactory("TokenManager");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    BondManagerMock = await ethers.getContractFactory("BondManagerMock");
    EmissionManagerMock = await ethers.getContractFactory(
      "EmissionManagerMock"
    );
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
  });
  beforeEach(async () => {
    manager = await TokenManager.deploy(factory.address);
    bondManager = await BondManagerMock.deploy();
    emissionManager = await EmissionManagerMock.deploy();
    await manager.setBondManager(bondManager.address);
    await manager.setEmissionManager(emissionManager.address);
  });

  async function addPair(
    underlyingDecimals: number,
    syntheticDecimals: number,
    bondDecimals?: number
  ) {
    const bondDecs = bondDecimals || syntheticDecimals;
    const { underlying: u, synthetic: s, pair } = await addUniswapPair(
      factory,
      router,
      "WBTC",
      underlyingDecimals,
      "KBTC",
      syntheticDecimals
    );
    bond = await deployToken(SyntheticToken, router, "KBond", bondDecs);
    underlying = u;
    synthetic = s;
    oracle = await Oracle.deploy(
      factory.address,
      underlying.address,
      synthetic.address,
      3600,
      await now()
    );
    await underlying.transferOperator(manager.address);
    await underlying.transferOwnership(manager.address);
    await synthetic.transferOperator(manager.address);
    await synthetic.transferOwnership(manager.address);
    await bond.transferOperator(manager.address);
    await bond.transferOwnership(manager.address);
  }

  async function doSomeTrading() {
    await oracle.update();
    await fastForwardAndMine(ethers.provider, 100);
    await router.swapExactTokensForTokens(
      ETH.div(1000),
      BTC.div(1000).div(2),
      [synthetic.address, underlying.address],
      op.address,
      (await now()) + 1800
    );

    await fastForwardAndMine(ethers.provider, 100);
    await router.swapExactTokensForTokens(
      ETH.div(1000).div(2),
      BTC.div(1000).div(5),
      [synthetic.address, underlying.address],
      op.address,
      (await now()) + 1800
    );
    await fastForwardAndMine(ethers.provider, 3400);
    await oracle.update();
  }

  describe("#constructor", () => {
    it("creates an instance of TokenManager", async () => {
      await expect(TokenManager.deploy(factory.address)).to.not.be.reverted;
    });
  });

  describe("#isManagedToken", () => {
    describe("when Synthetic token is managed", () => {
      it("returns true", async () => {
        await addPair(8, 18);
        expect(
          await manager.isManagedToken(synthetic.address),
          "Fresh manager shouldn't manage any tokens"
        ).to.eq(false);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(
          await manager.isManagedToken(synthetic.address),
          "Expected to manage synthetic token"
        ).to.eq(true);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("returns false", async () => {
        await addPair(8, 18);
        expect(
          await manager.isManagedToken(synthetic.address),
          "Fresh manager shouldn't manage any tokens"
        ).to.eq(false);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(
          await manager.isManagedToken(underlying.address),
          "Expected to manage synthetic token"
        ).to.eq(false);
      });
    });
  });

  describe("#syntheticDecimals", () => {
    describe("when Synthetic token is managed", () => {
      it("returns number of decimals for synthetic token", async () => {
        await addPair(8, 25);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.syntheticDecimals(synthetic.address)).to.eq(25);
        await addPair(6, 0);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.syntheticDecimals(synthetic.address)).to.eq(0);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.syntheticDecimals(underlying.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#underlyingDecimals", () => {
    describe("when Synthetic token is managed", () => {
      it("returns number of decimals for underlying token", async () => {
        await addPair(8, 25);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.underlyingDecimals(synthetic.address)).to.eq(8);
        await addPair(6, 0);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.underlyingDecimals(synthetic.address)).to.eq(6);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.underlyingDecimals(underlying.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#averagePrice", () => {
    describe("when Synthetic token is managed", () => {
      it("returns oracle average price", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await doSomeTrading();
        const managerPrice = await manager.averagePrice(
          synthetic.address,
          BigNumber.from(10).pow(18)
        );
        const oraclePrice = await oracle.consult(
          synthetic.address,
          BigNumber.from(10).pow(18)
        );

        expect(managerPrice).to.eq(oraclePrice);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.averagePrice(underlying.address, BigNumber.from(10).pow(18))
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#currentPrice", () => {
    describe("when Synthetic token is managed", () => {
      it("returns current uniswap price", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await doSomeTrading();
        const managerPrice = await manager.currentPrice(synthetic.address, ETH);
        const pairAddress = pairFor(
          factory.address,
          synthetic.address,
          underlying.address
        );
        const pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
        const [reserve0, reserve1] = await pair.getReserves();
        const [reserveUnderlying, reserveSynthetic] =
          synthetic.address.toLowerCase() < underlying.address.toLowerCase()
            ? [reserve1, reserve0]
            : [reserve0, reserve1];
        const currentPrice = reserveUnderlying.mul(ETH).div(reserveSynthetic);
        expect(managerPrice).to.eq(currentPrice);
      });

      describe("when amount is 0", () => {
        it("fails", async () => {
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          await expect(
            manager.currentPrice(synthetic.address, 0)
          ).to.be.revertedWith("UniswapV2Library: INSUFFICIENT_AMOUNT");
        });
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.currentPrice(underlying.address, BigNumber.from(10).pow(18))
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });

    describe("#addToken", () => {
      describe("when tokens are different and oracle tracks the pair", () => {
        it("adds the token pair", async () => {
          await addPair(8, 18);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          )
            .to.emit(manager, "TokenAdded")
            .withArgs(
              ethers.utils.getAddress(synthetic.address),
              ethers.utils.getAddress(underlying.address),
              ethers.utils.getAddress(oracle.address),
              ethers.utils.getAddress(
                pairFor(factory.address, synthetic.address, underlying.address)
              )
            );
          expect(await manager.isManagedToken(synthetic.address)).to.eq(true);
          expect(await manager.tokens(0)).to.eq(synthetic.address);
          await expect(manager.tokens(1)).to.be.reverted;

          const oldSynth = synthetic;

          await addPair(8, 18);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.not.be.reverted;
          expect(await manager.isManagedToken(synthetic.address)).to.eq(true);
          expect(await manager.tokens(0)).to.eq(oldSynth.address);
          expect(await manager.tokens(1)).to.eq(synthetic.address);
          await expect(manager.tokens(2)).to.be.reverted;
        });
      });
      describe("when tokens are the same", () => {
        it("fails", async () => {
          await addPair(8, 18);

          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              synthetic.address,
              oracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Synthetic token and Underlying tokens must be different"
          );
        });
      });
      describe("when synthetic decimals doesn't equal to bond decimals", () => {
        it("fails", async () => {
          await addPair(8, 18, 15);

          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Synthetic and Bond tokens must have the same number of decimals"
          );
        });
      });

      describe("when token already exists", () => {
        it("fails", async () => {
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.be.revertedWith("TokenManager: Token is already managed");
        });
      });

      describe("when oracle doesn't conform to IOracle interface", () => {
        it("fails", async () => {
          await addPair(8, 18);

          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              synthetic.address
            )
          ).to.be.revertedWith(
            "function selector was not recognized and there's no fallback function"
          );
        });
      });
      describe("when oracle doesn't match tokens", () => {
        it("fails", async () => {
          await addPair(8, 18);
          const oldOracle = oracle;
          await addPair(8, 18);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oldOracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Tokens and Oracle tokens are different"
          );
        });
      });
      describe("when synthetic token operator is not TokenManager", () => {
        it("fails", async () => {
          const { underlying: u, synthetic: s, pair } = await addUniswapPair(
            factory,
            router,
            "WBTC",
            8,
            "KBTC",
            18
          );
          underlying = u;
          synthetic = s;
          bond = await deployToken(SyntheticToken, router, "KBond", 18);
          await bond.transferOperator(manager.address);
          await bond.transferOwnership(manager.address);
          oracle = await Oracle.deploy(
            factory.address,
            underlying.address,
            synthetic.address,
            3600,
            await now()
          );
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Token operator and owner of the synthetic token must be set to TokenManager before adding a token"
          );
        });
      });
      describe("when caller is not operator", () => {
        it("fails", async () => {
          const [op, other] = await ethers.getSigners();
          await addPair(8, 18);
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
      describe("when Synthetic token is managed", () => {
        it("is deleted and operator is transferred to target", async () => {
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          const s1 = synthetic;
          const o1 = oracle;
          const u1 = underlying;
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          const s2 = synthetic;
          await expect(manager.deleteToken(s1.address, op.address))
            .to.emit(manager, "TokenDeleted")
            .withArgs(
              ethers.utils.getAddress(s1.address),
              ethers.utils.getAddress(u1.address),
              ethers.utils.getAddress(o1.address),
              ethers.utils.getAddress(
                pairFor(factory.address, s1.address, u1.address)
              )
            );
          expect(await manager.isManagedToken(s1.address)).to.eq(false);
          expect(await manager.isManagedToken(s2.address)).to.eq(true);
          expect(await manager.tokens(0)).to.eq(ethers.constants.AddressZero);
          expect(await manager.tokens(1)).to.eq(s2.address);
          expect(await s1.operator()).to.eq(op.address);
          expect(await s1.owner()).to.eq(op.address);
        });
      });
      describe("when caller is not operator", () => {
        it("fails", async () => {
          const [op, other] = await ethers.getSigners();
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          await expect(
            manager.connect(other).deleteToken(synthetic.address, op.address)
          ).to.be.revertedWith("Only operator can call this method");
        });
      });
    });
  });
});
