import {
  buildMarketingRecoveryAutoReplyBody,
  resolveMarketingRecoveryAutoReplyKind,
} from './build-marketing-recovery-auto-reply-body.util';
import { MARKETING_RECOVERY_PRESERVED_ASSIGNEE_MESSAGE_TEMPLATE } from '../constants/marketing-recovery-reply-message.constant';
import { VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE } from '../constants/ventor-assignment-message.constant';

describe('resolveMarketingRecoveryAutoReplyKind', () => {
  it('returns preserve when didPreserveAssignee is true', () => {
    expect(
      resolveMarketingRecoveryAutoReplyKind({
        didPreserveAssignee: true,
        didAssignVentor: false,
      }),
    ).toBe('preserve');
  });
  it('returns assign when only didAssignVentor is true', () => {
    expect(
      resolveMarketingRecoveryAutoReplyKind({
        didPreserveAssignee: false,
        didAssignVentor: true,
      }),
    ).toBe('assign');
  });
  it('returns none when neither flag is set', () => {
    expect(
      resolveMarketingRecoveryAutoReplyKind({
        didPreserveAssignee: false,
        didAssignVentor: false,
      }),
    ).toBe('none');
  });
  it('prefers preserve when both flags are set', () => {
    expect(
      resolveMarketingRecoveryAutoReplyKind({
        didPreserveAssignee: true,
        didAssignVentor: true,
      }),
    ).toBe('preserve');
  });
});

describe('buildMarketingRecoveryAutoReplyBody', () => {
  const ventorDisplay = { userName: 'Ana López', userPhone: '3001234567' };
  it('returns null for none', () => {
    expect(
      buildMarketingRecoveryAutoReplyBody({ kind: 'none', ventorDisplay }),
    ).toBeNull();
  });
  it('builds preserved assignee message with placeholders replaced', () => {
    const actual = buildMarketingRecoveryAutoReplyBody({
      kind: 'preserve',
      ventorDisplay,
    });
    expect(actual).toBe(
      MARKETING_RECOVERY_PRESERVED_ASSIGNEE_MESSAGE_TEMPLATE.replace(
        '[user_name]',
        'Ana López',
      ).replace('[user_phone]', '3001234567'),
    );
  });
  it('builds ventor assignment message for assign kind', () => {
    const actual = buildMarketingRecoveryAutoReplyBody({
      kind: 'assign',
      ventorDisplay,
    });
    expect(actual).toBe(
      VENTOR_ASSIGNMENT_CUSTOMER_MESSAGE_TEMPLATE.replace('[user_name]', 'Ana López').replace(
        '[user_phone]',
        '3001234567',
      ),
    );
  });
});
