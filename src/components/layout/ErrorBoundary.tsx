'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { InfoBlock } from '@ui/InfoBlock';
import { Container } from '@ui/Container';
import { Button, Heading, Text, VStack } from '@chakra-ui/react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Container py={10}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading as="h2" size="md" color="danger.default">
              Something went wrong.
            </Heading>
            <Text color="gray.250" fontSize="sm">
              {this.state.error.message}
            </Text>
            <Button onClick={this.reset} colorScheme="blue" size="sm">
              Try again
            </Button>
          </VStack>
        </InfoBlock>
      </Container>
    );
  }
}
