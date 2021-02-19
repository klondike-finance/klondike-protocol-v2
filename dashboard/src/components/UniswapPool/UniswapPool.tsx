import { Card, CardContent, Grid, Paper, Typography } from '@material-ui/core';
import UniswapPage from '../../pages/UniswapPage';

type PropsType = { token0: string; token1: string; pair: string };

const UniswapPool = ({ token0, token1, pair }: PropsType) => {
  const name = `${token1} - ${token0} Uniswap Pool`;
  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card variant="outlined">
        <CardContent>
          <Typography component="h1" variant="h6">
            {name}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
};

export default UniswapPool;
