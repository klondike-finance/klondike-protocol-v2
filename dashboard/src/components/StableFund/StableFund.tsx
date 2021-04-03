import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers, BigNumber } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate, toDecimal } from '../../lib/utils';
import Entry from '../Entry';

const StableFund = () => {
  const { provider, registry, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !registry || !deployments) return;
      const kwbtc = new ethers.Contract(deployments['KWBTC'].address, deployments['KWBTC'].abi, provider);
      const wbtc = new ethers.Contract(deployments['WBTC'].address, deployments['WBTC'].abi, provider);
      const kxusd = new ethers.Contract(deployments['KXUSD'].address, deployments['KXUSD'].abi, provider);
      const dai = new ethers.Contract(deployments['DAI'].address, deployments['DAI'].abi, provider);
      const pool = new ethers.Contract(deployments['StabFundV1'].address, deployments['StabFundV1'].abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const router = await pool.router();
        const traders = await pool.allAllowedTraders();
        const vaults = await pool.allAllowedVaults();
        const tokens = await pool.allAllowedTokens();

        const balanceKWBTC = await kwbtc.balanceOf(registry['StabFundV1'].address);
        const balanceWBTC = await wbtc.balanceOf(registry['StabFundV1'].address);
        const balanceKXUSD = await kxusd.balanceOf(registry['StabFundV1'].address);
        const balanceDAI = await dai.balanceOf(registry['StabFundV1'].address);

        const values = {
          owner,
          operator,
          router,
          blank1: null,
          traders,
          tokens,
          vaults,
          blank2: null,
          WBTC: toDecimal(balanceWBTC, 8),
          KBTC: toDecimal(balanceKWBTC, 18),
          DAI: toDecimal(balanceDAI, 18),
          KXUSD: toDecimal(balanceKXUSD, 18),
        };
        setData(values);
      } catch (e) {
        setError(e);
      }
    })();
  }, [provider, registry]);

  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title="StabFundV1" subheader={registry && <Entry v={registry['StabFundV1'].address} />} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default StableFund;
