import { useCallback, useRef, useState } from 'react';
import { Animated, FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AiBrain01Icon, BubbleChatAddIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import MaskedView from '@react-native-masked-view/masked-view';

import { BlurHeader } from '@/components/BlurHeader';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useChat } from '@/hooks/useChat';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, fontSize, spacing } from '@/lib/constants';
import { lightTap } from '@/lib/haptics';
import { playClick } from '@/lib/sounds';
import { useAgentsStore } from '@/stores/agents';
import { useConnectionStore } from '@/stores/connection';

export default function ChatScreen() {
  const router = useRouter();
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
  const keyboardHeight = useKeyboardHeight();
  const [inputHeight, setInputHeight] = useState(0);
  const onInputLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    setInputHeight(e.nativeEvent.layout.height);
  }, []);

  const listHeightRef = useRef(0);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    listHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const handleContentSizeChange = useCallback((_w: number, contentHeight: number) => {
    const viewportHeight = listHeightRef.current;
    if (contentHeight > viewportHeight) {
      listRef.current?.scrollToOffset({
        offset: contentHeight - viewportHeight,
        animated: false,
      });
    }
  }, []);

  const isDisabled = connectionStatus !== 'connected' || agent?.status === 'offline';

  return (
    <Animated.View style={[styles.container, { paddingBottom: keyboardHeight }]}>
      <ConnectionStatus />
      {messages.length === 0 ? (
        <Pressable style={styles.emptyContainer} onPress={Keyboard.dismiss}>
          <HugeiconsIcon icon={AiBrain01Icon} size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            Start a conversation with {agent?.name ?? 'this agent'}
          </Text>
        </Pressable>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: inputHeight }]}
          keyboardDismissMode="interactive"
          onLayout={handleLayout}
          onContentSizeChange={handleContentSizeChange}
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
          <Pressable
            onPress={() => {
              lightTap();
              playClick();
              router.push(`/chat/${agentId}?newChat=1`);
            }}
            hitSlop={8}
          >
            <HugeiconsIcon icon={BubbleChatAddIcon} size={24} color={colors.accent} />
          </Pressable>
        }
      />
      <Animated.View
        style={[styles.inputContainer, { bottom: keyboardHeight }]}
        onLayout={onInputLayout}
      >
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
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingTop: 100,
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
    position: 'absolute',
    left: 0,
    right: 0,
    paddingBottom: spacing.md,
  },
});
