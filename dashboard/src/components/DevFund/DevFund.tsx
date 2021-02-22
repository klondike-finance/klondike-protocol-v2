import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate, toDecimal } from '../../lib/utils';
import Entry from '../Entry';
import devfundabi from '../../data/devfundabi.json';

const DevFund = () => {
  const { provider, registry, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !registry || !deployments) return;
      const pool = new ethers.Contract(registry['DevFund'].address, devfundabi, provider);
      const kwbtc = new ethers.Contract(deployments['KWBTC'].address, deployments['KWBTC'].abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const balanceKWBTC = await kwbtc.balanceOf(registry['DevFund'].address);

        const values = {
          owner,
          operator,
          blank1: null,
          kbtc: toDecimal(balanceKWBTC, 18),
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
        <CardHeader title="DevFund" subheader={registry && <Entry v={registry['DevFund'].address} />} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default DevFund;
