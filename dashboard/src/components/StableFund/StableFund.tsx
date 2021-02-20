import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers, BigNumber } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';
import stablefundabi from '../../data/stablefundabi.json';

const StableFund = () => {
  const { provider, registry, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !registry || !deployments) return;
      const kwbtc = new ethers.Contract(deployments['KWBTC'].address, deployments['KWBTC'].abi, provider);
      const wbtc = new ethers.Contract(deployments['WBTC'].address, deployments['WBTC'].abi, provider);
      const pool = new ethers.Contract(registry['StableFund'].address, stablefundabi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const pair = await pool.pair();
        const router = await pool.router();
        const tokenA = await pool.tokenA();
        const tokenB = await pool.tokenB();
        const trader = await pool.trader();

        const balanceKWBTC = await kwbtc.balanceOf(registry['StableFund'].address);
        const balanceWBTC = await kwbtc.balanceOf(registry['StableFund'].address);

        const migrated = await pool.migrated();

        const values = {
          owner,
          operator,
          blank1: null,
          pair,
          router,
          tokenA,
          tokenB,
          trader,
          blank2: null,
          WBTC: balanceWBTC.toNumber() / 10 ** 8,
          KBTC: balanceKWBTC.div(BigNumber.from(10).pow(10)).toNumber() / 10 ** 8,
          blank3: null,
          migrated,
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
        <CardHeader title="StableFund" subheader={registry && <Entry v={registry['StableFund'].address} />} />
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
