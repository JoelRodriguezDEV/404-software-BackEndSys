/*eslint-disable*/
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // main.ts
  app.enableCors({
    // Permite tanto local como tu nueva URL de Vercel
    origin: [
      'http://localhost:5173',
      'https://budget-manager-404-three.vercel.app',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
