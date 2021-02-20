import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';
import stablefundabi from '../../data/stablefundabi.json';

const StableFund = () => {
  const { provider, registry } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !registry) return;
      const pool = new ethers.Contract(registry['StableFund'].address, stablefundabi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const pair = await pool.pair();
        const router = await pool.router();
        const tokenA = await pool.tokenA();
        const tokenB = await pool.tokenB();
        const trader = await pool.trader();

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
