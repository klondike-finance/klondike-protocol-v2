import { useContext } from 'react';
import { EthereumContext } from '../../App';
import { etherscanLink } from '../../lib/utils';
import styled from 'styled-components';
import { Link } from '@material-ui/core';

const Entry = ({ k, v }: { k?: string; v: string }) => {
  const { addressIndex } = useContext(EthereumContext);
  if (!addressIndex) return null;
  if (v === null) {
    return <Container>&nbsp;</Container>;
  }
  if (Array.isArray(v)) {
    return (
      <ArrayContainer>
        <div>{k}:</div>
        {v.map((value) => {
          const name = addressIndex[value.toLowerCase()] || 'Unknown';
          return (
            <span>
              {`${name} (`}
              <Link
                href={`${etherscanLink()}/address/${value}`}
                target="_blank"
                color="textSecondary"
              >{`${value}`}</Link>
              {')'}
            </span>
          );
        })}
        <div>----------</div>
      </ArrayContainer>
    );
  }
  const value = v.toString();
  if (value.startsWith('0x')) {
    if (!k) {
      return (
        <Link href={`${etherscanLink()}/address/${value}`} target="_blank" color="textSecondary">{`${value}`}</Link>
      );
    }
    const name = addressIndex[value.toLowerCase()] || 'Unknown';
    return (
      <Container>
        <span>
          {`${k}: ${name} (`}
          <Link href={`${etherscanLink()}/address/${value}`} target="_blank" color="textSecondary">{`${value}`}</Link>
          {')'}
        </span>
      </Container>
    );
  }
  return <Container>{`${k}: ${value}`}</Container>;
};

const Container = styled.div`
  display: flex;
`;

const ArrayContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export default Entry;
