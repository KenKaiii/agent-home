import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import * as Clipboard from 'expo-clipboard';

import { Copy01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { format } from 'date-fns';
import Markdown from 'react-native-markdown-display';

import { StreamingCursor } from '@/components/StreamingText';
import { colors, fontSize, spacing } from '@/lib/constants';
import type { ChatMessage } from '@/types';

const markdownStyles = StyleSheet.create({
  body: { color: colors.text, fontSize: fontSize.md },
  code_inline: {
    backgroundColor: colors.surface,
    color: colors.accent,
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
  },
  fence: {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: spacing.md,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    marginVertical: spacing.sm,
  },
  heading1: { color: colors.text, fontSize: fontSize.xxl, fontWeight: 'bold' },
  heading2: { color: colors.text, fontSize: fontSize.xl, fontWeight: 'bold' },
  heading3: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold' },
  link: { color: colors.accent },
  strong: { color: colors.text, fontWeight: 'bold' },
  em: { color: colors.text, fontStyle: 'italic' },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.md,
    marginLeft: 0,
    backgroundColor: 'transparent',
  },
  list_item: { color: colors.text },
  bullet_list_icon: { color: colors.textSecondary },
  ordered_list_icon: { color: colors.textSecondary },
});

function ChatBubbleInner({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const timeStr = format(new Date(message.createdAt), 'HH:mm');

  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(message.content);
  }, [message.content]);

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.agentContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.agentBubble]}>
        {isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{message.content || ' '}</Markdown>
        )}
        {message.streaming && <StreamingCursor />}

        <View style={styles.footer}>
          <Text style={[styles.time, isUser && styles.timeUser]}>{timeStr}</Text>
          {!message.streaming && !isUser && (
            <Pressable onPress={handleCopy} hitSlop={8}>
              <HugeiconsIcon icon={Copy01Icon} size={12} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export const ChatBubble = memo(ChatBubbleInner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  agentContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: spacing.md,
  },
  userBubble: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  agentBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#ffffff',
    fontSize: fontSize.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  time: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  timeUser: {
    color: 'rgba(255,255,255,0.6)',
  },
});
