import { Grid } from '@material-ui/core';
import UniswapBoardroom from '../../components/UniswapBoardroom';
import LiquidBoardroom from '../../components/LiquidBoardroom';

const ManagersPage = () => {
  return (
    <Grid container spacing={3}>
      <UniswapBoardroom />
      <LiquidBoardroom />
    </Grid>
  );
};

export default ManagersPage;
