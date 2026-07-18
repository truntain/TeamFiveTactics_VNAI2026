import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { RoadmapService } from './roadmap.service';

@Controller('api/career')
export class RoadmapController {
  constructor(private readonly roadmapService: RoadmapService) {}

  @Post('roadmap')
  async createRoadmap(
    @Body() body: any,
  ) {
    return this.roadmapService.generateRoadmap(body);
  }

  @Get('trends')
  async getTrends(@Query('region') region?: string) {
    return this.roadmapService.getTrends(region);
  }

  @Get('detail')
  async getDetail(@Query('name') name: string) {
    return this.roadmapService.getCareerDetail(name);
  }
}
