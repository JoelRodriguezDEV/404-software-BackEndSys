/*eslint-disable*/
import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // 🛠️ MOTOR DE DISEÑO (PLANTILLA MAESTRA PARA TODOS LOS PDFs)
  // ============================================================================
  private initDocument(title: string): {
    doc: PDFKit.PDFDocument;
    buffers: Buffer[];
  } {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));

    // 1. Marca de agua centralizada
    this.addWatermark(doc);

    // 2. Encabezado Profesional
    const logoPath = path.join(process.cwd(), 'src/assets/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 50 });
    }

    doc
      .fillColor('#000000')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(title.toUpperCase(), 115, 45);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#666666')
      .text(`Fecha de Emisión: ${new Date().toLocaleString()}`, 115, 65)
      .text(`Sistema de Gestión 404 SLEEP NOT FOUND`, 115, 80);

    // 3. Línea divisoria
    doc
      .moveTo(50, 110)
      .lineTo(545, 110)
      .lineWidth(1)
      .strokeColor('#CCCCCC')
      .stroke();

    return { doc, buffers };
  }

  private addWatermark(doc: PDFKit.PDFDocument) {
    const logoPath = path.join(process.cwd(), 'src/assets/logo.png');
    if (fs.existsSync(logoPath)) {
      doc
        .save()
        .opacity(0.06) // Transparencia sutil y elegante
        .image(
          logoPath,
          (doc.page.width - 300) / 2,
          (doc.page.height - 300) / 2,
          {
            width: 300,
          },
        )
        .restore();
    }
  }

  private checkPageBreak(
    doc: PDFKit.PDFDocument,
    currentY: number,
    heightNeeded: number,
  ): number {
    if (currentY + heightNeeded > 750) {
      doc.addPage();
      this.addWatermark(doc); // Re-aplicar marca de agua en la nueva página
      return 50; // Retorna el nuevo Y
    }
    return currentY;
  }

  // ============================================================================
  // 📄 1. REPORTE MAESTRO DE OPERACIONES (ACTUALIZADO SIN PRODUCTOS)
  // ============================================================================
  async generateMonthlyReport(): Promise<Buffer> {
    const { doc, buffers } = this.initDocument(
      'Reporte Maestro de Operaciones',
    );
    let currentY = 140;

    // Recolección de Datos (Sin "products")
    const members = await this.prisma.member.findMany({
      include: { payments: true },
      orderBy: { name: 'asc' },
    });
    const rooms = await this.prisma.room.findMany({
      include: { members: true },
    });
    const revenueData = await this.prisma.payment.aggregate({
      _sum: { amount: true },
    });

    const totalRevenue = revenueData._sum.amount || 0;
    const totalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);
    const totalOccupied = rooms.reduce((acc, r) => acc + r.members.length, 0);

    // Resumen Ejecutivo
    doc
      .fillColor('#000000')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('RESUMEN EJECUTIVO', 50, currentY);
    currentY += 20;

    const drawKPI = (x: number, title: string, value: string) => {
      doc.rect(x, currentY, 150, 50).fillAndStroke('#FAFAFA', '#DDDDDD');
      doc
        .fillColor('#666666')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(title, x + 10, currentY + 10);
      doc
        .fillColor('#000000')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(value, x + 10, currentY + 25);
    };

    drawKPI(50, 'INGRESOS TOTALES', `$${totalRevenue.toFixed(2)}`);
    drawKPI(
      210,
      'MIEMBROS ACTIVOS',
      `${members.filter((m) => m.status === 'ACTIVE').length}`,
    );
    drawKPI(
      370,
      'OCUPACIÓN HOTELERA',
      `${totalOccupied} / ${totalCapacity} camas`,
    );
    currentY += 80;

    // Tabla de Miembros
    currentY = this.checkPageBreak(doc, currentY, 100);
    doc
      .fillColor('#000000')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('1. ESTADO DE FINANZAS POR CLIENTE', 50, currentY);
    currentY += 20;

    doc.rect(50, currentY, 495, 20).fill('#333333');
    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .text('CLIENTE', 60, currentY + 6);
    doc.text('ESTADO', 300, currentY + 6);
    doc.text('APORTE TOTAL', 400, currentY + 6, { width: 90, align: 'right' });
    currentY += 20;

    members.forEach((m, i) => {
      currentY = this.checkPageBreak(doc, currentY, 20);
      if (i % 2 === 0) doc.rect(50, currentY, 495, 20).fill('#F9F9F9');
      const totalPaid = m.payments.reduce((acc, p) => acc + p.amount, 0);

      doc.fillColor('#000000').font('Helvetica').fontSize(9);
      doc.text(m.name.toUpperCase(), 60, currentY + 5);
      doc
        .fillColor(m.status === 'ACTIVE' ? '#000000' : '#999999')
        .text(m.status, 300, currentY + 5);
      doc
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text(`$${totalPaid.toFixed(2)}`, 400, currentY + 5, {
          width: 90,
          align: 'right',
        });
      currentY += 20;
    });

    doc.end();
    return new Promise((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(buffers))),
    );
  }

  // ============================================================================
  // 🧾 2. RECIBO INDIVIDUAL
  // ============================================================================
  async generateSingleReceipt(paymentId: number): Promise<Buffer> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { member: true },
    });

    if (!payment) throw new NotFoundException('El pago solicitado no existe.');

    const { doc, buffers } = this.initDocument(
      `Recibo de Transacción #${payment.id.toString().padStart(4, '0')}`,
    );
    let currentY = 140;

    doc.rect(50, currentY, 495, 100).fillAndStroke('#FAFAFA', '#DDDDDD');
    doc.fillColor('#666666').fontSize(10).font('Helvetica-Bold');
    doc
      .text('CLIENTE:', 70, currentY + 20)
      .fillColor('#000000')
      .font('Helvetica')
      .text(payment.member.name.toUpperCase(), 150, currentY + 20);
    doc
      .fillColor('#666666')
      .font('Helvetica-Bold')
      .text('FECHA PAGO:', 70, currentY + 40)
      .fillColor('#000000')
      .font('Helvetica')
      .text(new Date(payment.date).toLocaleDateString(), 150, currentY + 40);
    doc
      .fillColor('#666666')
      .font('Helvetica-Bold')
      .text('CONCEPTO:', 70, currentY + 60)
      .fillColor('#000000')
      .font('Helvetica')
      .text(payment.concept || 'Pago General', 150, currentY + 60);

    doc
      .fillColor('#000000')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(`TOTAL: $${payment.amount.toFixed(2)}`, 350, currentY + 40, {
        width: 150,
        align: 'right',
      });
    currentY += 130;

    if (payment.receiptUrl) {
      doc
        .fillColor('#000000')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('COMPROBANTE ADJUNTO:', 50, currentY);
      currentY += 20;
      try {
        const response = await axios.get(payment.receiptUrl, {
          responseType: 'arraybuffer',
        });
        const imageBuffer = Buffer.from(response.data, 'binary');
        doc.image(imageBuffer, 50, currentY, {
          fit: [495, 400],
          align: 'center',
        });
      } catch (e) {
        doc
          .fillColor('#999999')
          .font('Helvetica')
          .fontSize(10)
          .text(
            '(Error al cargar la imagen del comprobante desde la nube)',
            50,
            currentY,
          );
      }
    }

    doc.end();
    return new Promise((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(buffers))),
    );
  }

  // ============================================================================
  // 📋 3. LISTADO DE PARTICIPANTES
  // ============================================================================
  async generateMemberDirectory(): Promise<Buffer> {
    const { doc, buffers } = this.initDocument(
      'Directorio de Participantes Activos',
    );
    let currentY = 140;

    const members = await this.prisma.member.findMany({
      orderBy: { name: 'asc' },
    });

    doc.rect(50, currentY, 495, 20).fill('#333333');
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('NOMBRE DEL PARTICIPANTE', 60, currentY + 6);
    doc.text('CONTACTO', 300, currentY + 6);
    doc.text('ESTADO', 450, currentY + 6);
    currentY += 25;

    doc.font('Helvetica').fontSize(10);

    if (members.length === 0) {
      doc
        .fillColor('#999999')
        .text('No hay miembros registrados en el sistema.', 60, currentY + 10);
    } else {
      members.forEach((m, i) => {
        currentY = this.checkPageBreak(doc, currentY, 20);

        if (i % 2 === 0) doc.rect(50, currentY - 5, 495, 20).fill('#F9F9F9');

        doc.fillColor('#000000').text(m.name.toUpperCase(), 60, currentY);
        doc.text(m.email || 'N/A', 300, currentY);

        doc
          .fillColor(m.status === 'ACTIVE' ? '#000000' : '#999999')
          .text(m.status || 'ACTIVO', 450, currentY);

        currentY += 20;
      });
    }

    doc.end();
    return new Promise((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(buffers))),
    );
  }

  // ============================================================================
  // 🏢 4. REPORTE GLOBAL DE HABITACIONES
  // ============================================================================
  async generateAllRoomsReport(): Promise<Buffer> {
    const { doc, buffers } = this.initDocument(
      'Reporte Global de Asignación de Cuartos',
    );
    let currentY = 140;

    const rooms = await this.prisma.room.findMany({
      include: { members: true },
      orderBy: { name: 'asc' },
    });

    rooms.forEach((room) => {
      currentY = this.checkPageBreak(doc, currentY, 80);

      doc.rect(50, currentY, 495, 25).fill('#333333');
      doc
        .fillColor('#FFFFFF')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(room.name.toUpperCase(), 60, currentY + 7);
      doc
        .fontSize(10)
        .text(
          `Ocupación: ${room.members.length} / ${room.capacity}`,
          400,
          currentY + 8,
          { width: 135, align: 'right' },
        );
      currentY += 25;

      doc.fillColor('#000000').fontSize(10).font('Helvetica');
      if (room.members.length === 0) {
        doc
          .fillColor('#666666')
          .text(
            'No hay participantes asignados a esta habitación.',
            60,
            currentY + 10,
          );
        currentY += 35;
      } else {
        currentY += 10;
        room.members.forEach((m) => {
          currentY = this.checkPageBreak(doc, currentY, 20);
          doc.text(`• ${m.name.toUpperCase()}`, 70, currentY);
          currentY += 15;
        });
        currentY += 10;
      }
    });

    doc.end();
    return new Promise((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(buffers))),
    );
  }

  // ============================================================================
  // 🛏️ 5. REPORTE DE HABITACIÓN INDIVIDUAL
  // ============================================================================
  async generateSingleRoomReport(roomId: number): Promise<Buffer> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true },
    });

    if (!room) throw new Error('Habitación no encontrada');

    const { doc, buffers } = this.initDocument(
      `Asignación - ${room.name.toUpperCase()}`,
    );
    let currentY = 140;

    doc
      .fillColor('#000000')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(
        `Detalle de Participantes (${room.members.length} de ${room.capacity} camas)`,
        50,
        currentY,
      );
    currentY += 20;

    doc.rect(50, currentY, 495, 20).fill('#F0F0F0').stroke('#DDDDDD');
    doc
      .fillColor('#333333')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('NOMBRE COMPLETO', 60, currentY + 6);
    doc.text('CONTACTO', 300, currentY + 6);
    currentY += 25;

    doc.fillColor('#000000').font('Helvetica').fontSize(10);
    if (room.members.length === 0) {
      doc
        .fillColor('#999999')
        .text('Habitación disponible / Sin asignaciones.', 60, currentY);
    } else {
      room.members.forEach((m) => {
        doc.text(m.name.toUpperCase(), 60, currentY);
        doc.text(m.email || 'N/A', 300, currentY);
        currentY += 20;
        doc
          .moveTo(50, currentY - 5)
          .lineTo(545, currentY - 5)
          .lineWidth(0.5)
          .strokeColor('#EEEEEE')
          .stroke();
      });
    }

    doc.end();
    return new Promise((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(buffers))),
    );
  }

  // ============================================================================
  // 📊 6. REPORTE DE PRESUPUESTO POR EVENTO
  // ============================================================================
  async generateEventReport(eventId: number): Promise<Buffer> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        expenses: { include: { category: true } },
      },
    });

    if (!event) throw new NotFoundException('El evento no existe.');

    const { doc, buffers } = this.initDocument(`Presupuesto: ${event.name}`);
    let currentY = 140;

    // 1. Cálculos de Presupuesto
    const revenueData = await this.prisma.payment.aggregate({
      _sum: { amount: true },
    });
    const totalRevenue = revenueData._sum.amount || 0;
    const totalExpenses = event.expenses.reduce(
      (acc, exp) => acc + exp.unitCost * exp.quantity,
      0,
    );
    const remaining = totalRevenue - totalExpenses;

    // 2. Tarjetas de Resumen Ejecutivo
    doc
      .fillColor('#000000')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('RESUMEN DE PRESUPUESTO', 50, currentY);
    currentY += 20;

    const drawKPI = (
      x: number,
      title: string,
      value: string,
      color: string = '#000000',
    ) => {
      doc.rect(x, currentY, 150, 50).fillAndStroke('#FAFAFA', '#DDDDDD');
      doc
        .fillColor('#666666')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(title, x + 10, currentY + 10);
      doc
        .fillColor(color)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(value, x + 10, currentY + 25);
    };

    drawKPI(50, 'INGRESOS (CAJA TOTAL)', `$${totalRevenue.toFixed(2)}`);
    drawKPI(210, 'COSTO DEL EVENTO', `$${totalExpenses.toFixed(2)}`, '#FF0000');
    drawKPI(
      370,
      'PRESUPUESTO DISPONIBLE',
      `$${remaining.toFixed(2)}`,
      remaining < 0 ? '#FF0000' : '#00AA00',
    );
    currentY += 80;

    // 3. Tabla de Gastos
    doc
      .fillColor('#000000')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('DESGLOSE DE GASTOS', 50, currentY);
    currentY += 20;

    doc.rect(50, currentY, 495, 20).fill('#333333');
    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .text('PRODUCTO / SERVICIO', 60, currentY + 6);
    doc.text('CATEGORÍA', 220, currentY + 6);
    doc.text('CANT.', 320, currentY + 6);
    doc.text('C. UNIT.', 370, currentY + 6);
    doc.text('SUBTOTAL', 440, currentY + 6, { width: 95, align: 'right' });
    currentY += 25;

    doc.font('Helvetica').fontSize(9);
    if (event.expenses.length === 0) {
      doc
        .fillColor('#999999')
        .text('No hay gastos registrados para este evento.', 60, currentY);
    } else {
      event.expenses.forEach((exp, i) => {
        currentY = this.checkPageBreak(doc, currentY, 20);
        if (i % 2 === 0) doc.rect(50, currentY - 5, 495, 20).fill('#F9F9F9');

        const subtotal = exp.quantity * exp.unitCost;
        doc.fillColor('#000000').text(exp.name.toUpperCase(), 60, currentY);
        doc.text(exp.category.name, 220, currentY);
        doc.text(exp.quantity.toString(), 320, currentY);
        doc.text(`$${exp.unitCost.toFixed(2)}`, 370, currentY);
        doc
          .font('Helvetica-Bold')
          .text(`$${subtotal.toFixed(2)}`, 440, currentY, {
            width: 95,
            align: 'right',
          })
          .font('Helvetica');
        currentY += 20;
      });
    }

    doc.end();
    return new Promise((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(buffers))),
    );
  }
}
