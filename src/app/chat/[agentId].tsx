import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useChat } from '@/hooks/useChat';
import { colors, fontSize, spacing } from '@/lib/constants';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';

export default function ChatScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const navigation = useNavigation();
  const agent = useAgentsStore((s) => s.agents.get(agentId ?? ''));
  const connectionStatus = useConnectionStore((s) => s.status);
  const { messages, sendMessage, isStreaming } = useChat(agentId ?? '');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({
      title: agent?.name ?? agentId ?? 'Chat',
      headerRight: () => (
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                agent?.status === 'online'
                  ? colors.green
                  : agent?.status === 'busy'
                    ? colors.yellow
                    : colors.red,
            },
          ]}
        />
      ),
    });
  }, [agent, agentId, navigation]);

  const isDisabled =
    connectionStatus !== 'connected' || agent?.status === 'offline';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ConnectionStatus />
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{agent?.icon ?? '🤖'}</Text>
          <Text style={styles.emptyText}>
            Start a conversation with {agent?.name ?? 'this agent'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.list}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListFooterComponent={
            isStreaming ? (
              <View style={styles.typingContainer}>
                <Text style={styles.typingText}>
                  {agent?.name ?? 'Agent'} is typing...
                </Text>
              </View>
            ) : null
          }
        />
      )}
      <ChatInput onSend={sendMessage} disabled={isDisabled} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  typingContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  typingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
});
