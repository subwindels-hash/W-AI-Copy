module "network" {
  source = "./modules/network"

  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
}

module "database" {
  source = "./modules/database"

  environment       = var.environment
  vpc_id            = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
}

module "redis" {
  source = "./modules/redis"

  environment       = var.environment
  vpc_id            = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  instance_class    = var.cache_instance_class
}
