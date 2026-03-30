import { useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';

import { AiBrain01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import MaskedView from '@react-native-masked-view/masked-view';

import { BlurHeader } from '@/components/BlurHeader';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useChat } from '@/hooks/useChat';
import { colors, fontSize, spacing } from '@/lib/constants';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';

export default function ChatScreen() {
  const { agentId, sessionId, newChat } = useLocalSearchParams<{
    agentId: string;
    sessionId?: string;
    newChat?: string;
  }>();
  const agent = useAgentsStore((s) => s.agents.get(agentId ?? ''));
  const connectionStatus = useConnectionStore((s) => s.status);
  const { messages, sendMessage, isStreaming, isWorking } = useChat(
    agentId ?? '',
    sessionId,
    Boolean(newChat),
  );
  const listRef = useRef<FlatList>(null);

  const isDisabled = connectionStatus !== 'connected' || agent?.status === 'offline';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ConnectionStatus />
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <HugeiconsIcon icon={AiBrain01Icon} size={48} color={colors.textSecondary} />
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
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={
            isStreaming ? (
              <View style={styles.typingContainer}>
                <Text style={styles.typingText}>{agent?.name ?? 'Agent'} is typing...</Text>
              </View>
            ) : null
          }
        />
      )}
      <BlurHeader
        title={isWorking ? 'Working now' : (agent?.name ?? agentId ?? 'Chat')}
        isWorking={isWorking}
        rightElement={
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
        }
      />
      <View style={styles.inputContainer}>
        <MaskedView
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
          maskElement={
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)']}
              locations={[0, 0.15, 0.35, 1]}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        </MaskedView>
        <ChatInput onSend={sendMessage} disabled={isDisabled} isWorking={isWorking} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingTop: 100,
    paddingBottom: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
  inputContainer: {
    paddingBottom: spacing.md,
  },
});
