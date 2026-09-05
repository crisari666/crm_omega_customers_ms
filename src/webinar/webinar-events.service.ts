import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateWebinarEventDto } from './dto/create-webinar-event.dto';
import { UpdateWebinarEventDto } from './dto/update-webinar-event.dto';
import {
  WebinarEvent,
  WebinarEventDocument,
  WebinarEventStatus,
} from './schemas/webinar-event.schema';
import { formatWebinarTemplateDateTime } from './utils/format-webinar-template-datetime.util';
import { WebinarGoogleCalendarService } from './webinar-google-calendar.service';

/**
 * Admin CRUD for customer webinar events.
 */
@Injectable()
export class WebinarEventsService {
  private readonly logger = new Logger(WebinarEventsService.name);

  constructor(
    @InjectModel(WebinarEvent.name)
    private readonly webinarEventModel: Model<WebinarEventDocument>,
    private readonly webinarGoogleCalendarService: WebinarGoogleCalendarService,
  ) {}

  async executeCreate(dto: CreateWebinarEventDto): Promise<WebinarEventDocument> {
    const scheduledAt = this.resolveScheduledAt(dto.scheduledAt);
    const templateFields = formatWebinarTemplateDateTime(scheduledAt);
    const status = dto.status ?? WebinarEventStatus.Draft;
    if (status === WebinarEventStatus.Active) {
      await this.executeClearActiveEvents();
    }
    const created = await this.webinarEventModel.create({
      name: dto.name.trim(),
      dayLabel: templateFields.dayLabel,
      dateText: templateFields.dateText,
      timeText: templateFields.timeText,
      meetLink: '',
      status,
      scheduledAt,
    });
    await this.executeSyncGoogleCalendar(created);
    this.logger.log(`Created webinar event ${String(created._id)} status=${status}`);
    return created;
  }

  async executeUpdate(
    eventId: string,
    dto: UpdateWebinarEventDto,
  ): Promise<WebinarEventDocument> {
    const event = await this.webinarEventModel.findById(eventId).exec();
    if (event == null) {
      throw new NotFoundException(`Webinar event ${eventId} was not found`);
    }
    if (dto.status === WebinarEventStatus.Active && event.status !== WebinarEventStatus.Active) {
      await this.executeClearActiveEvents(eventId);
    }
    let shouldSyncCalendar = false;
    if (dto.name != null) {
      event.name = dto.name.trim();
      shouldSyncCalendar = true;
    }
    if (dto.status != null) {
      event.status = dto.status;
    }
    if (dto.scheduledAt !== undefined) {
      const scheduledAt = this.resolveScheduledAt(dto.scheduledAt);
      const templateFields = formatWebinarTemplateDateTime(scheduledAt);
      event.scheduledAt = scheduledAt;
      event.dayLabel = templateFields.dayLabel;
      event.dateText = templateFields.dateText;
      event.timeText = templateFields.timeText;
      shouldSyncCalendar = true;
    }
    await event.save();
    if (shouldSyncCalendar) {
      await this.executeSyncGoogleCalendar(event);
    }
    return event;
  }

  async executeList(): Promise<WebinarEventDocument[]> {
    return this.webinarEventModel.find().sort({ scheduledAt: -1, createdAt: -1 }).exec();
  }

  async executeFindActive(): Promise<WebinarEventDocument | null> {
    return this.webinarEventModel
      .findOne({ status: WebinarEventStatus.Active })
      .sort({ scheduledAt: -1, createdAt: -1 })
      .exec();
  }

  async executeGetById(eventId: string): Promise<WebinarEventDocument> {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new BadRequestException('Invalid webinar event id');
    }
    const event = await this.webinarEventModel.findById(eventId).exec();
    if (event == null) {
      throw new NotFoundException(`Webinar event ${eventId} was not found`);
    }
    return event;
  }

  /**
   * Deletes the webinar event and its Google Calendar entry. Leads are kept for history.
   */
  async executeDelete(eventId: string): Promise<{ readonly deleted: true; readonly id: string }> {
    const event = await this.executeGetById(eventId);
    const calendarEventId = event.googleCalendarEventId?.trim() ?? '';
    if (calendarEventId.length > 0) {
      try {
        await this.webinarGoogleCalendarService.executeDeleteWebinarCalendarEvent(
          calendarEventId,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to delete Google Calendar event ${calendarEventId}: ${message}`,
        );
      }
    }
    await this.webinarEventModel.deleteOne({ _id: event._id }).exec();
    this.logger.log(`Deleted webinar event ${eventId}`);
    return { deleted: true, id: eventId };
  }

  private async executeSyncGoogleCalendar(event: WebinarEventDocument): Promise<void> {
    const webinarEventId = String(event._id);
    const description = [
      `Webinar: ${event.name}`,
      `Día: ${event.dayLabel}`,
      `Fecha: ${event.dateText}`,
      `Hora: ${event.timeText} (America/Bogota)`,
    ].join('\n');
    if (
      event.googleCalendarEventId != null &&
      event.googleCalendarEventId.trim().length > 0
    ) {
      const meetUrl =
        await this.webinarGoogleCalendarService.executePatchWebinarCalendarEvent({
          eventId: event.googleCalendarEventId,
          summary: event.name,
          description,
          startAt: event.scheduledAt,
        });
      if (meetUrl != null && meetUrl.trim().length > 0) {
        event.meetLink = meetUrl.trim();
      }
      await event.save();
      return;
    }
    const created =
      await this.webinarGoogleCalendarService.executeCreateWebinarCalendarEvent({
        webinarEventId,
        summary: event.name,
        description,
        startAt: event.scheduledAt,
      });
    event.googleCalendarEventId = created.eventId;
    event.meetLink = created.meetUrl;
    await event.save();
  }

  private resolveScheduledAt(value: Date): Date {
    const scheduledAt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date');
    }
    return scheduledAt;
  }

  private async executeClearActiveEvents(exceptEventId?: string): Promise<void> {
    const filter: Record<string, unknown> = { status: WebinarEventStatus.Active };
    if (exceptEventId != null && Types.ObjectId.isValid(exceptEventId)) {
      filter._id = { $ne: new Types.ObjectId(exceptEventId) };
    }
    await this.webinarEventModel.updateMany(filter, {
      $set: { status: WebinarEventStatus.Closed },
    });
  }
}
