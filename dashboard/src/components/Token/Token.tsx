import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers, BigNumber } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate, toDecimal } from '../../lib/utils';
import Entry from '../Entry';

type PropsType = { name: string };

const Token = ({ name }: PropsType) => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments[name];
      const token = new ethers.Contract(address, abi, provider);
      try {
        let owner = ethers.constants.AddressZero;
        try {
          owner = await token.owner();
        } catch (e) {}
        let operator = ethers.constants.AddressZero;
        try {
          operator = await token.operator();
        } catch (e) {}

        const totalSupply = await token.totalSupply();
        const decimals = await token.decimals();

        const values = {
          owner,
          operator,
          blank1: null,
          decimals,
          totalSupply: toDecimal(totalSupply, decimals),
        };
        setData(values);
      } catch (e) {
        setError(e);
      }
    })();
  }, [provider, deployments]);

  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title={name} subheader={deployments && <Entry v={deployments[name].address} />} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default Token;
