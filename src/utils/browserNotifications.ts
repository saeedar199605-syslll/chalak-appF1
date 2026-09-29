/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClickUrl?: string;
}

class BrowserNotificationManager {
  private permission: NotificationPermission = 'default';

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermissionStatus(): NotificationPermission {
    if (this.isSupported()) {
      this.permission = Notification.permission;
    }
    return this.permission;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('Browser Notifications are not supported in this environment.');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result;
      return result === 'granted';
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      return false;
    }
  }

  public send(payload: NotificationPayload): boolean {
    if (!this.isSupported() || this.permission !== 'granted') {
      return false;
    }

    try {
      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/chalak-logo.png',
        tag: payload.tag || 'chalak-eval-alert',
        dir: 'rtl',
        lang: 'fa',
        silent: false
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto close after 7 seconds
      setTimeout(() => {
        try {
          notification.close();
        } catch {}
      }, 7000);

      return true;
    } catch (e) {
      console.error('Error triggering notification:', e);
      return false;
    }
  }

  public sendWorkflowDeadlineAlert(role: string, count: number, deadlineText?: string) {
    if (count <= 0) return;

    if (role === 'supervisor') {
      this.send({
        title: 'هشدار مهلت تاییدات ارزیابی عملکرد - اصفهان چالاک',
        body: `تعداد ${count} پرونده ارزیابی عملکرد زیرمجموعه در انتظار بررسی و ثبت نمرات شماست. مهلت تکمیل: ${deadlineText || 'تا پایان هفته جاری'}.`,
        tag: 'supervisor-pending-tasks'
      });
    } else if (role === 'employee') {
      this.send({
        title: 'یادآوری تکمیل خودارزیابی دوره‌ای',
        body: 'فرم خودارزیابی نیم‌سال جاری برای شما فعال شده است. لطفاً نسبت به ثبت نمرات و مستندات اقدام نمایید.',
        tag: 'employee-self-eval'
      });
    } else if (role === 'admin') {
      this.send({
        title: 'فرآیند کالیبراسیون و تاییدات نهایی',
        body: `تعداد ${count} پرونده در مرحله تایید کمیته ارزیابی و منابع انسانی قرار دارد.`,
        tag: 'hr-calibration-alert'
      });
    }
  }
}

export const browserNotifications = new BrowserNotificationManager();
