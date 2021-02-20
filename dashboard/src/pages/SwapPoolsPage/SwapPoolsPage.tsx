import { Grid } from '@material-ui/core';
import SwapPool from '../../components/SwapPool';

const SwapPoolsPage = () => {
  const pools = ['KWBTCWBTCLPJediPool', 'DroidDAILPJediPool', 'JediDAILPJediPool'];
  return (
    <Grid container spacing={3}>
      <SwapPool />
    </Grid>
  );
};

export default SwapPoolsPage;
