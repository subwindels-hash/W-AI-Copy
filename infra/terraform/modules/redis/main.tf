# ── ElastiCache Redis ──────────────────────────────────────────────────────
resource "aws_security_group" "redis" {
  name        = "${var.environment}-windels-redis-sg"
  description = "Allow Redis from VPC"
  vpc_id      = var.vpc_id
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.environment}-windels-redis-sg" }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-windels-redis-subnets"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.environment}-windels-redis"
  description                = "WINDELS Redis"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.instance_class
  num_cache_clusters         = var.environment == "prod" ? 2 : 1
  automatic_failover_enabled = var.environment == "prod" ? true : false
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  tags = { Name = "${var.environment}-windels-redis" }
}
